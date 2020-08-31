const status = require('http-status');
const { BAD_REQUEST} = require('http-status');

module.exports.errCatching = function (err){
  console.error("Catching ERROR: ", err);
  let statusCode = BAD_REQUEST;
  if(typeof(err) === 'number'){
    statusCode = err;
    err = undefined
  }
  return {
    statusCode: statusCode,
    body: JSON.stringify(
      {
        status: status[statusCode],
        body: err,
      },
      null,
      2
    ),
  };
}