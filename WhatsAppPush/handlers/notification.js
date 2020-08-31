'use strict';

const status = require('http-status');
const Joi = require('@hapi/joi');
const AWS = require("aws-sdk");
const { OK } = require('http-status');
const docClient = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10' });
const S3 = new AWS.S3();
const { errCatching } = require('./functions.js');
const { enqueueMessage } = require("../libs/sqs-client.js");
const table = process.env.DDB_NOTIFICATION_TASK_TABLE_NAME;
const uuid = require("uuid");
const csvToJson = require("csvtojson");
const xlsx = require("node-xlsx");


module.exports.createNotification = async event => {
  try {
    var body = JSON.parse(event.body);

    const schema = Joi.object({
      message: Joi.string(),
      message_template_id: Joi.string(),
      recipient: Joi.string(),
      recipient_list_file: Joi.string(),
      user_id: Joi.string().required(),
    })
      .xor('message', 'message_template_id')
      .xor('recipient', 'recipient_list_file')
      .or('message', 'message_template_id')
      .or('recipient', 'recipient_list_file');

    var { error, value } = schema.validate(body, { abortEarly: false });
    if (error) {
      console.log(JSON.stringify(error));
      console.log(JSON.stringify(value));
      throw (error);
    }

    if (body.message_template_id) {
      console.log("Getting message from template ", body.message_template_id);
      let params = {
        TableName: process.env.DDB_TEMPLATES_TABLE_NAME,
        Key: {
          "user_id": body.user_id,
          "template_id": body.message_template_id
        },
      }
      await docClient.get(params).promise()
        .then(r => {
          console.log("Fetched template: ", r)
          body.message = r.Item.message_text
        })
        .catch(e => {
          console.error("Error fetching: ", e);
          throw e
        });
    }

    body.notification_id = uuid.v1();

    const recipients = body.recipient
      ? [body.recipient]
      : await getRecipientsFromFile(`${body.user_id}/${body.recipient_list_file}`);

    // Publish message over queue
    if (body.message && recipients.length) {
      console.log("Recipients: ", recipients);
      const enqueueMessagesJobs = recipients.map(
        async (phone_number) => {
          console.log("phone_number: ", phone_number);
          await enqueueMessage({
            notification_id: body.notification_id,
            user_id: body.user_id,
            sent_from: "+14155238886", // Twilio Sandbox number
            sent_to: phone_number,
            message: body.message,
          })}
      );

      await Promise.all(enqueueMessagesJobs);
    }

    body.created_at = Date.now();
    const ddbparams = {
      TableName: table,
      Item: body
    };

    await docClient.put(ddbparams)
      .promise()
      .then(d => console.log("Dynamodb inserted ", JSON.stringify(d)))
      .catch(e => { throw (e) });

    return {
      statusCode: OK,
      body: JSON.stringify(
        {
          status: status[OK],
          body: body
        },
        null,
        2
      ),
    };
  }
  catch (err) {
    return errCatching(err);
  }
}

module.exports.listNotificationTasks = async event => {
  try {
    const user_id = event.pathParameters.user_id;
    Joi.assert(user_id, Joi.number().positive());

    const params = {
      TableName: table,
      KeyConditionExpression: "user_id = :userId",
      ExpressionAttributeValues: {
        ":userId": user_id,
      },
    };

    const result = await docClient.query(params).promise();

    return {
      statusCode: OK,
      body: JSON.stringify(
        {
          status: status[OK],
          user_id: user_id,
          data: result.Items || [],
        },
        null,
        2
      ),
    };
  }
  catch (err) {
    return errCatching(err);
  }
}

async function getRecipientsFromFile(recipient_list_file) {
  console.log("Getting recipients from file: ",recipient_list_file);
  const fileType = recipient_list_file.substr(
    recipient_list_file.lastIndexOf(".") + 1
  );

  let recipient = [];

  if (fileType.toLowerCase() === "csv") {
    recipient = await getRecipientsFromCSV(recipient_list_file);
  } else if (fileType.toLowerCase() === "xlsx") {
    recipient = await getRecipientsFromXLSX(recipient_list_file);
  }

  return recipient;
}

async function getRecipientsFromCSV(filePath) {
  const recipients = [];

  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: filePath,
  };

  // get csv file and create stream
  console.log("about to open S3 bucket");
  const stream = S3.getObject(params).createReadStream();
  console.log("opened");
  // convert csv file (stream) to JSON format data
  const json = await csvToJson().fromStream(stream);
  console.log("contents: ",json); // TODO when bucket does not exists thet we have 500
  for (let index = 0, len = json.length; index < len; index++) {
    recipients.push(json[index]["Phone Number"]);
  }

  return recipients;
}

async function getRecipientsFromXLSX(filePath) {
  const recipients = [];

  const params = {
    Bucket: process.env.RECIPIENT_S3_BUCKET_NAME,
    Key: filePath,
  };

  return new Promise((resolve, reject) => {
    // get csv file and create stream
    const file = S3.getObject(params).createReadStream();
    const buffers = [];

    file.on("data", (data) => {
      buffers.push(data);
    });

    file.on("end", () => {
      const buffer = Buffer.concat(buffers);
      const workbook = xlsx.parse(buffer);
      const firstSheet = workbook[0].data;
      firstSheet.shift();

      firstSheet.forEach((data) => {
        data[0] && recipients.push(data[0]);
        return data;
      });

      resolve(recipients);
    });
  });
}