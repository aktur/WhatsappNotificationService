'use strict';

const status = require('http-status');
var AWS = require("aws-sdk");

module.exports.update = async event => {
  try{
    var body = JSON.parse(event.body);
    body.user_id = event.pathParameters.user_id;
    body.template_id = event.pathParameters.template_id;
    validateInputData(body);
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
      statusCode: 500,
      body: JSON.stringify(
        {
          status: status[500],
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
    var body = JSON.parse(event.body);
    body.user_id = event.pathParameters.user_id;
    body.template_id = event.pathParameters.template_id;
    validateInputData(body);
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
      statusCode: 500,
      body: JSON.stringify(
        {
          status: status[500],
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
    var body = JSON.parse(event.body);
    body.user_id = event.pathParameters.user_id;
    body.template_id = event.pathParameters.template_id;
    validateInputData(body);
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
      statusCode: 500,
      body: JSON.stringify(
        {
          status: status[500],
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
    var body = JSON.parse(event.body);
    body.user_id = event.pathParameters.user_id;
    validateInputData(body);
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
      statusCode: 500,
      body: JSON.stringify(
        {
          status: status[500],
          body: err,
        },
        null,
        2
      ),
    };
  }
}

//var doc = require('dynamodb-doc');
//var db = new doc.DynamoDB();

module.exports.createTemplates = async event => {

  const { v4: uuid } = require('uuid');

  try{
    var body = JSON.parse(event.body);
    validateInputData(body);
    body.template_id = uuid();

    AWS.config.update({region: 'us-east-1'});
    var docClient = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});
    var table = "Templates";
    var params = {
      TableName: "Templates",
      Item: body
      // Item:{
      //     "user_id": body.user_id,
      //     "template_id": body.uuid,
      //     "template_name": body.template_name
      // }
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
      statusCode: 500,
      body: JSON.stringify(
        {
          status: status[500],
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
      message_text: Joi.string()
          .alphanum(),  
      user_id: Joi.number()
          .integer()
          .min(1)
          .required(),
      idempotent_key: Joi.string()
          .alphanum(),
      template_id: Joi.string()
          .alphanum()
  });

  const { error, value }  = schema.validate(body);
  if(error){ 
    console.log(JSON.stringify(error, value));
    throw(error);
  }
  return body;
}