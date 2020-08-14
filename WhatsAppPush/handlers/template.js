'use strict';

const status = require('http-status');
const Joi = require('@hapi/joi');
const AWS = require("aws-sdk");
const { BAD_REQUEST, NOT_FOUND, OK } = require('http-status');
const docClient = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});
const s3 = new AWS.S3({signatureVersion: "v4"}); // need this for ignoring contents type is signing
const table = process.env.DDB_TEMPLATES_TABLE_NAME;
const bucket = process.env.S3_BUCKET_NAME;
const { errCatching } = require('./functions.js');

module.exports.getSignedUrl = async event => {
  try{
    const { user_id } = event.pathParameters;
    var body = JSON.parse(event.body);

    const schema = Joi.object({
      file_name: Joi.string()
          .required(),
    });

    var { error, value }  = schema.validate(body);
    if(error){ 
      console.log(JSON.stringify(error));
      console.log(JSON.stringify(value));
      throw(error);
    }

    const params = {Bucket: bucket, Key: `${user_id}/${body.file_name}`, Expires: 3600};
    const url = s3.getSignedUrl('putObject', params);

    console.log('The URL is', url);

    return {
      statusCode: OK,
      body: JSON.stringify(
        {
          status: status[OK],
          url: url,
          params: params,
        },
        null,
        2
      ),
    };
  }
  catch (err){
    return errCatching(err);
  }
}

module.exports.createTemplates = async event => {

  const { v4: uuid } = require('uuid');

  try{
    var body = JSON.parse(event.body);
    body.template_id = uuid();
    validateInputData(body);

    var params = {
      TableName: table,
      FilterExpression : 'user_id = :user_id and idempotent_key = :idempotent_key',
      ExpressionAttributeValues : {
        ':user_id' : body.user_id,
        ':idempotent_key' : body.idempotent_key
      }
    };

    var scan = {};
    await docClient.scan(params)
      .promise()
      .then(res => {
        console.log("Scan results: ", JSON.stringify(res));
        scan = res
      })
      .catch(err => {throw(err)});

    if(scan.Count > 0){
      return {
        statusCode: OK,
        body: JSON.stringify(
          {
            status: status[OK],
            body: scan.Items[0],
          },
          null,
          2
        ),
      };
    }

    params = {
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
          body: body,
        },
        null,
        2
      ),
    };
  }
  catch(err) {
    return errCatching(err);
  }
};

module.exports.update = async event => {
  try{
    var body = JSON.parse(event.body);
    body.user_id = event.pathParameters.user_id;
    body.template_id = event.pathParameters.template_id;
    body.idempotent_key = "dummy";
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

    await docClient.get(params)
      .promise()
      .then(res => {
        console.log("Original data: ", res);
        console.log("Params: ", params);
        if(JSON.stringify(res) === JSON.stringify({})){
          throw NOT_FOUND;
        }
      })
      .catch(err => {throw(err)});

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
    return errCatching(err);
  }
}

module.exports.delete = async event => {
  try{
    var body = {};
    body.user_id = event.pathParameters.user_id;
    body.template_id = event.pathParameters.template_id;
    body.idempotent_key = "dummy";
    validateInputData(body);

    var params = {
      TableName:table,
      Key:{
        "user_id": body.user_id,
        "template_id": body.template_id
      },
    };
  
    await docClient.get(params)
      .promise()
      .then(res => {
        console.log("Original data: ", res);
        console.log("Params: ", params);
        if(JSON.stringify(res) === JSON.stringify({})){
          throw NOT_FOUND;
        }
      })
      .catch(err => {throw(err)});

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
    return errCatching(err);
  }
}

module.exports.details = async event => {
  try{
    var body = {};
    body.user_id = event.pathParameters.user_id;
    body.template_id = event.pathParameters.template_id;
    body.idempotent_key = "dummy";
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
      .then(res => {
        if(JSON.stringify(res) === JSON.stringify({})){
          throw NOT_FOUND;
        };
        body = res;
      })
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
    return errCatching(err);
  }
}

module.exports.list = async event => {
  try{
    var body = {};
    var user_id = event.pathParameters.user_id;
    body.user_id = user_id;
    body.idempotent_key = "dummy";
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
    return errCatching(err);
  }
}

function validateInputData(body){
  const schema = Joi.object({
      template_name: Joi.string()
          .alphanum()
          .min(1),
      message_text: Joi.string(),  
      user_id: Joi.string()
          .min(1)
          .required(),
      idempotent_key: Joi.string()
          .required(),
      template_id: Joi.string()
  });

  var { error, value }  = schema.validate(body);
  if(error){ 
    console.log(JSON.stringify(error, value));
    error.statusCode = status[BAD_REQUEST];
    throw(error);
  }
  return body;
}