'use strict';

const status = require('http-status');
var AWS = require("aws-sdk");
var docClient = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});
var table = "Templates";

module.exports.update = async event => {
  try{
    var body = JSON.parse(event.body);
    body.user_id = event.pathParameters.user_id;
    body.template_id = event.pathParameters.template_id;
    validateInputData(body);
    var params = {
      TableName:table,
      Key:{
        "user_id": body.user_id,
        "template_id": body.template_id
      },
      UpdateExpression: "set message_text = :m",
      ExpressionAttributeValues:{
          ":m":body.message_text,
      },
      ReturnValues:"UPDATED_NEW"
    };

    await docClient.update(params)
    .promise()
    .then(res => {body = res})
    .catch(err => {throw(err)});

    return {
      statusCode: 200,
      body: JSON.stringify(
        {
          status: status[200],
          body: body,
        },
        null,
        2
      ),
    };
  }
  catch (err){
    return {
      statusCode: err.statusCode,
      body: JSON.stringify(
        {
          status: status[err.statusCode],
          body: err,
        },
        null,
        2
      ),
    };
  }
}

module.exports.delete = async event => {
  try{
    var body = {};
    body.user_id = event.pathParameters.user_id;
    body.template_id = event.pathParameters.template_id;
    validateInputData(body);

    var params = {
      TableName:table,
      Key:{
        "user_id": body.user_id,
        "template_id": body.template_id
      },
    };
  
    await docClient.delete(params, function(err, data) {
      if (err) {
        console.error("Unable to delete item. Error JSON:", JSON.stringify(err, null, 2));
        throw(err);
      } else {
        console.log("DeleteItem succeeded:", JSON.stringify(data, null, 2));
      }
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify(
        {
          status: status[200],
          body: body,
        },
        null,
        2
      ),
    };
  }
  catch (err){
    return {
      statusCode: err.statusCode,
      body: JSON.stringify(
        {
          status: status[err.statusCode],
          body: err,
        },
        null,
        2
      ),
    };
  }
}

module.exports.details = async event => {
  try{
    var body = {};
    body.user_id = event.pathParameters.user_id;
    body.template_id = event.pathParameters.template_id;
    validateInputData(body);

    var params = {
      TableName: table,
      Key:{
        "user_id": body.user_id,
        "template_id": body.template_id
      },
    };
  
    await docClient.get(params)
      .promise()
      .then(res => {body = res})
      .catch(err => {throw(err)});

    return {
      statusCode: 200,
      body: JSON.stringify(
        {
          status: status[200],
          body: body,
        },
        null,
        2
      ),
    };
  }
  catch (err){
    return {
      statusCode: err.statusCode,
      body: JSON.stringify(
        {
          status: status[err.statusCode],
          body: err,
        },
        null,
        2
      ),
    };
  }
}

module.exports.list = async event => {
  try{
    var body = {};
    var user_id = event.pathParameters.user_id;
    body.user_id = user_id;
    validateInputData(body);

    const params = {
      TableName: table,
      FilterExpression : 'user_id = :user_id',
      ExpressionAttributeValues : {':user_id' : user_id}
    };
    await docClient.scan(params)
      .promise()
      .then(res => {body = res})
      .catch(err => {throw(err)});
    return {
      statusCode: 200,
      body: JSON.stringify(
        {
          status: status[200],
          body: body,
        },
        null,
        2
      ),
    };
  }
  catch (err){
    return {
      statusCode: err.statusCode,
      body: JSON.stringify(
        {
          status: status[err.statusCode],
          body: err
        },
        null,
        2
      ),
    };
  }
}

module.exports.createTemplates = async event => {

  const { v4: uuid } = require('uuid');

  try{
    var body = JSON.parse(event.body);
    validateInputData(body);
    body.template_id = uuid();

    var params = {
      TableName: table,
      Item: body
    };

    await docClient.put(params)
      .promise()
      .then(d => console.log("Dynamodb inserted ", JSON.stringify(d)))
      .catch(e => {throw(e)});

    return {
      statusCode: 200,
      body: JSON.stringify(
        {
          status: status[200],
//          input: event,
          body: body,
        },
        null,
        2
      ),
    };
  }
  catch(err) {
    console.error(err);
    return {
      statusCode: err.statusCode,
      body: JSON.stringify(
        {
          status: status[err.statusCode],
          error: err,
        },
        null,
        2
      ),
    };
  }
};

function validateInputData(body){
  const Joi = require('@hapi/joi');

  const schema = Joi.object({
      template_name: Joi.string()
          .alphanum()
          .min(1)
          .max(30),
      message_text: Joi.string(),  
      user_id: Joi.number()
          .integer()
          .min(1)
          .required(),
      idempotent_key: Joi.string(),
      template_id: Joi.string()
  });

  var { error, value }  = schema.validate(body);
  if(error){ 
    console.log(JSON.stringify(error, value));
    error.statusCode = 400;
    throw(error);
  }
  return body;
}