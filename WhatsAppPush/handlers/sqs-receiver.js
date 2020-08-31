'use strict';

const AWS = require("aws-sdk");
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
const docClient = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10' });
const { OK } = require('http-status');
const { errCatching } = require('./functions.js');
const status = require('http-status');

module.exports.statusCallback = async event => {
  console.log(JSON.stringify(event));
  try {
    const params = event.body;
    // Change parameters stream to JSON object. Shoudn't there be a standard function?
    let body = JSON.parse('{"' + decodeURI(params.replace(/&/g, "\",\"").replace(/=/g, "\":\"")) + '"}');
    console.log("body:", JSON.stringify(body));

    // TODO Validate POST body (but why, this is call from Twilio after all and not our user)
    const statuses = { queued: 1, sent: 2, undelivered: 3, failed: 4, delivered: 4, read: 6 }
    var result;
    await docClient.scan({
      TableName: process.env.DDB_STATUS_LOGS_TABLE_NAME,
      FilterExpression: "log_id = :sid",
      ExpressionAttributeValues: {
        ':sid': body.MessageSid
      },
    })
      .promise()
      .then(res => { console.log("Query inside: ", JSON.stringify(result = res)) })
      .catch(err => { console.log("Query Error inside: ", JSON.stringify(err)) });
    console.log("Query results: ", JSON.stringify(result.Items || []));

    // Check if new status is indeed newer to get rid of race conditions, so older status does not
    // overwrite newer one:
    console.log(body.MessageStatus, "<-", result.Items[0].delivery_status, statuses[body.MessageStatus], statuses[result.Items[0].delivery_status], statuses[body.MessageStatus] < statuses[result.Items[0].delivery_status])
    if (result.Items && statuses[body.MessageStatus] && statuses[body.MessageStatus] < statuses[result.Items[0].delivery_status]) {
      console.error("Callback out of order: old ", result.Items[0].delivery_status, ", new ", body.MessageStatus);
      throw OK;
    }

    await docClient.update({
      TableName: process.env.DDB_STATUS_LOGS_TABLE_NAME,
      Key: {
        "notification_id": result.Items[0].notification_id,
        "log_id": result.Items[0].log_id
      },
      UpdateExpression: "set delivery_status = :m",
      ExpressionAttributeValues: {
        ":m": body.MessageStatus,
      },
      ReturnValues: "UPDATED_NEW"
    }).promise()
      .then(res => { console.log("Update: ", JSON.stringify(res)) })
      .catch(err => { console.log("Updaate Error: ", JSON.stringify(err)) });
    if (body.ErrorCode) {
      console.log("Message error: ", body.ErrorCode, " ", body.MessageStatus);
      await docClient.update({
        TableName: process.env.DDB_STATUS_LOGS_TABLE_NAME,
        Key: {
          "notification_id": result.Items[0].notification_id,
          "log_id": result.Items[0].log_id
        },
        UpdateExpression: "set error_code = :m, error_message = :e",
        ExpressionAttributeValues: {
          ":m": body.ErrorCode,
          ":e": body.ErrorMessage
        },
        ReturnValues: "UPDATED_NEW"
      }).promise()
        .then(res => { console.log("Update: ", JSON.stringify(res)) })
        .catch(err => { console.log("Updaate Error: ", JSON.stringify(err)) });
    }

    return {
      statusCode: OK,
      body: JSON.stringify(
        {
          status: status[OK],
          body: body,
          event: event,
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

module.exports.process = async event => {
  console.log("SQS message: ", JSON.stringify(event));
  const body = JSON.parse(event.Records[0].body);
  console.log("SQS message body: ", JSON.stringify(body));

  const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_ACCOUNT_AUTH_TOKEN);

  console.log("Twilio Client: ", client);
  var message = {};
  var sent_to = body.sent_to.replace(/-/g, "");
  console.log("sent_to: ", body.sent_to, " -> ", sent_to)
  try {
    await client.messages
      .create({
        from: 'whatsapp:' + body.sent_from,
        body: body.message,
        to: 'whatsapp:' + sent_to,
        statusCallback: process.env.TWILIO_CALLBACK_URL
      })
      .then(m => {
        console.log("Twilio Message: ", JSON.stringify(m));
        message = m;
      })
  }
  catch (err) {
    console.error("Twilio Catch error: ", JSON.stringify(err));
  }
  finally {
    // TODO better error processing from Twilio to judge when remove message from the queue and when not

    // Detete message from the SQS
    var deleteParams = {
      QueueUrl: process.env.SQS_QUEUE_URL,
      ReceiptHandle: event.Records[0].receiptHandle
    };
    await sqs.deleteMessage(deleteParams, function (err, data) {
      if (err) {
        console.error("SQS Delete Error", JSON.stringify(err));
      } else {
        console.log("SQS Message Deleted", JSON.stringify(data));
      }
    }).promise();

    // Insert record into DDB
    let item = {
      "notification_id": body.notification_id,
      "log_id": message.sid,
      "delivery_status": message.status,
      "user_id": body.user_id,
      "sent_from": message.from,
      "sent_to": message.to,
      "message": message.body,
      "sent_at": message.dateCreated.toString()
    }
    console.log("Inserting into DDB", JSON.stringify(item));
    const ddbparams = {
      TableName: process.env.DDB_STATUS_LOGS_TABLE_NAME,
      Item: item
    };

    await docClient.put(ddbparams)
      .promise()
      .then(d => console.log("Dynamodb inserted ", JSON.stringify(d)))
      .catch(e => { console.error("DDB insertion error: ", JSON.stringify(e)) });
  }
}