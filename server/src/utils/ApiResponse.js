export class ApiResponse {
  constructor(data = null, message = 'OK') {
    this.success = true;
    this.data = data;
    this.message = message;
  }

  static send(res, data = null, message = 'OK', statusCode = 200) {
    return res.status(statusCode).json(new ApiResponse(data, message));
  }

  static created(res, data = null, message = 'Created') {
    return ApiResponse.send(res, data, message, 201);
  }
}

export default ApiResponse;
