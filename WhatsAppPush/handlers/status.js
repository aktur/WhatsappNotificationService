'use strict';

const AWS = require("aws-sdk");
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
const docClient = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10' });
const { BAD_REQUEST, NOT_FOUND, OK } = require('http-status');
const { errCatching } = require('./functions.js');
const status = require('http-status');
const Joi = require('@hapi/joi');

module.exports.status = async event => {
  try {
    let { notification_id } = event.pathParameters;
    if (!notification_id) { throw (BAD_REQUEST) };

    let result;
    const params = {
      TableName: process.env.DDB_STATUS_LOGS_TABLE_NAME,
      KeyConditionExpression: "notification_id = :notificationId",
      ExpressionAttributeValues: {
        ':notificationId': notification_id
      },
    }
    console.log(JSON.stringify(params))
    await docClient.query(params)
      .promise()
      .then(res => { console.log("Query inside: ", JSON.stringify(result = res)) })
      .catch(err => { console.log("Query Error inside: ", JSON.stringify(err)) });
    if (result.Items.length == 0) { throw NOT_FOUND }
    console.log("Query results: ", JSON.stringify(result.Items || []));

    return {
      statusCode: OK,
      body: JSON.stringify(
        {
          status: status[OK],
          body: notification_id,
          result: result,
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

module.exports.details = async event => {
  try {
    let { notification_id, log_id } = event.pathParameters;
    console.log(event.pathParameters);
    if (!notification_id || !log_id) { throw (BAD_REQUEST) };

    let result;
    await docClient.get({
      TableName: process.env.DDB_STATUS_LOGS_TABLE_NAME,
      Key: {
        notification_id: notification_id,
        log_id: log_id
      }
    })
      .promise()
      .then(res => { console.log("Get: ", JSON.stringify(result = res)) })
      .catch(err => {
        console.log("Error: ", JSON.stringify(err));
        throw (err)
      });
    if (JSON.stringify(result) === JSON.stringify({})) { throw NOT_FOUND }
    console.log("Query results: ", JSON.stringify(result.Items || []));

    return {
      statusCode: OK,
      body: JSON.stringify(
        {
          status: status[OK],
          result: result,
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

module.exports.summary = async event => {
  try {
    let { notification_id } = event.pathParameters;
    if (!notification_id) { throw (BAD_REQUEST) };

    let result;
    await docClient.query({
      TableName: process.env.DDB_STATUS_LOGS_TABLE_NAME,
      KeyConditionExpression: "notification_id = :notificationId",
      ExpressionAttributeValues: {
        ':notificationId': notification_id
      },
    })
      .promise()
      .then(res => result = res)
      .catch(err => { console.log("Query Error inside: ", JSON.stringify(err)) });
    if (result.Items.length == 0) { throw NOT_FOUND }
    console.log("Query results: ", JSON.stringify(result.Items || []));

    const summary = { queued: 0, failed: 0, sent: 0, delivered: 0, undelivered: 0, read: 0 }
    result.Items.map(val => summary[val.delivery_status] += 1);

    return {
      statusCode: OK,
      body: JSON.stringify(
        {
          status: status[OK],
          summary: summary,
          result: result,
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