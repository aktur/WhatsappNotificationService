const status = require('http-status');
const { BAD_REQUEST} = require('http-status');

module.exports.errCatching = function (err){
  console.error("Catching ERROR: ", err);
  let statusCode = BAD_REQUEST;
  return {
    statusCode: statusCode,
    body: JSON.stringify(
      {
        statusCode: statusCode,
        status: status[statusCode],
        body: err,
      },
      null,
      2
    ),
  };
}