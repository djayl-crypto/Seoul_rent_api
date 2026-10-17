import { errorResponse, ServiceError } from '../../src/server/http.js';

export function onRequest() {
  return errorResponse(new ServiceError('NOT_FOUND', 404));
}
