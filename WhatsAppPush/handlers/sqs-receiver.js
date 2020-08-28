'use strict';

const AWS = require("aws-sdk");
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
const docClient = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10' });
const { BAD_REQUEST, NOT_FOUND, OK } = require('http-status');
const { errCatching } = require('./functions.js');
const status = require('http-status');
const Joi = require('@hapi/joi');

module.exports.statusCallback = async event => {
  console.log(JSON.stringify(event));
  try {
    const params = event.body;
    // Change parameters stream to JSON object. Shoudn't there be a standard function?
    let body = JSON.parse('{"' + decodeURI(params.replace(/&/g, "\",\"").replace(/=/g, "\":\"")) + '"}');
    console.log("body:", JSON.stringify(body));

    // TODO Validate POST body (but why, this is call from Twilio after all and not our user)

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
      .then(res => { console.log("Update: ", JSON.stringify(result = res)) })
      .catch(err => { console.log("Updaate Error: ", JSON.stringify(err)) });
    if (body.ErrorCode) {
      console.log("Message error: ", body.ErrorCode, " ", body.MessageStatus);
      await docClient.update({
        TableName: process.env.DDB_STATUS_LOGS_TABLE_NAME,
        Key: {
          "notification_id": result.Items[0].notification_id,
          "log_id": result.Items[0].log_id
           },
        UpdateExpression: "set error_code = :m",
        ExpressionAttributeValues: {
          ":m": body.ErrorCode,
        },
        ReturnValues: "UPDATED_NEW"
      }).promise()
        .then(res => { console.log("Update: ", JSON.stringify(result = res)) })
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

  const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_ACCOUNT_AUTH_TOKEN);

  console.log("Twilio Client: ", client);
  var message = {};
  try {
    await client.messages
      .create({
        from: 'whatsapp:+14155238886',
        body: event.Records[0].body,
        to: 'whatsapp:' + event.Records[0].messageAttributes.Recipient.stringValue,
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
    // Insert record into DDB
    let item = {
      "notification_id": event.Records[0].messageId,
      "log_id": message.sid,
      "delivery_status": message.status,
      "user_id": event.Records[0].messageAttributes.userId.stringValue,
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
  }
}