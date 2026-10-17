export class ServiceError extends Error {
  constructor(code, status = 502) {
    super(code);
    this.name = 'ServiceError';
    this.code = code;
    this.status = status;
  }
}

const messages = {
  DATA_NOT_READY: '자료를 준비하고 있습니다. 수집 완료 후 다시 확인해 주세요.',
  INVALID_QUERY: '조회 조건을 확인해 주세요.',
  SOURCE_NOT_CONFIGURED: '원본 조회를 사용할 수 없습니다.',
  ADMIN_DISABLED: '관리 기능을 사용할 수 없습니다.',
  UNAUTHORIZED: '인증이 필요합니다.',
  SOURCE_UNAVAILABLE: '원본 자료를 확인할 수 없습니다.',
  SOURCE_AUTH_FAILED: '원본 서비스 인증을 확인할 수 없습니다.',
  SOURCE_LIMITED: '원본 서비스의 호출 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
  SOURCE_INVALID_RESPONSE: '원본 자료 형식을 확인할 수 없습니다.',
  SOURCE_CHANGED: '수집 중 원본 건수가 변경되었습니다. 새 수집을 시작해 주세요.',
  INVALID_ARCHIVE: '과거 자료의 기간·형식·출처를 확인해 주세요.',
  INVALID_ADMIN_REQUEST: '관리 요청 조건을 확인해 주세요.',
  SYNC_CONFLICT: '다른 수집 단계가 진행되었습니다. 상태를 다시 확인해 주세요.',
  STORAGE_UNAVAILABLE: '수집 저장소를 사용할 수 없습니다.',
  INVALID_SOURCE_QUERY: '원본 조회 조건을 확인해 주세요.',
  NOT_FOUND: '요청한 경로가 없습니다.',
  INTERNAL_ERROR: '요청을 처리할 수 없습니다.',
};

export function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

export function errorResponse(error) {
  const known = error instanceof ServiceError && Object.hasOwn(messages, error.code);
  const code = known ? error.code : 'INTERNAL_ERROR';
  return json({ error: { code, message: messages[code] } }, known ? error.status : 500);
}
