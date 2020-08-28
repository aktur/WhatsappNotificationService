'use strict';

const status = require('http-status');
const Joi = require('@hapi/joi');
const AWS = require("aws-sdk");
const { OK } = require('http-status');
const docClient = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10' });
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
const s3 = new AWS.S3();
const { errCatching } = require('./functions.js');
const table = process.env.DDB_NOTIFICATION_TASK_TABLE_NAME;

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

    var { error, value } = schema.validate(body, {abortEarly: false});
    if (error) {
      console.log(JSON.stringify(error));
      console.log(JSON.stringify(value));
      throw (error);
    }

    // TODO process recipient file from S3 bucket
    if(body.recipient_list_file){
      throw "TODO recipient_list_file"
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

    var sqsparams = {
      MessageAttributes: {
        "Recipient": {
          DataType: "String",
          StringValue: body.recipient
        },
        "userId": {
          DataType: "String",
          StringValue: body.user_id
        }
      },
      MessageBody: body.message,
      QueueUrl: process.env.SQS_QUEUE_URL,
      MessageGroupId: "Whatsapp-Notifications"
    };

    console.log("send sqs ", sqsparams);
    await sqs.sendMessage(sqsparams, function (err, data) {
      if (err) {
        console.log("Error", err);
        throw (err);
      } else {
        console.log("Success", body.notification_id = data.MessageId);
      }
    }).promise()
      .catch(e => { throw (e) });

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
          notification_id: body.notification_id,
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