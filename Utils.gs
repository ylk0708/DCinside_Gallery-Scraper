/**
 * 공통 유틸리티 함수 모음
 */

/**
 * 날짜 문자열 정규화 (YYYY.MM.DD 형태로 변환)
 * - HH:mm (오늘) -> YYYY.MM.DD HH:mm
 * - MM.DD (올해) -> YYYY.MM.DD
 * - YY.MM.DD (과거/올해) -> 20YY.MM.DD
 */
function normalizeDate(dateStr) {
  if (!dateStr) return '';
  dateStr = dateStr.trim();

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  // 1. HH:mm 형식 (오늘)
  if (dateStr.includes(':') && !dateStr.includes('.')) {
    return `${year}.${month}.${day}`;
  }

  // 2. YY.MM.DD 또는 YYYY.MM.DD
  if (dateStr.includes('.')) {
    const parts = dateStr.split('.');
    if (parts.length === 3) {
      // 연도가 2자리인 경우 (예: 24.12.31)
      if (parts[0].length === 2) {
        return `20${parts[0]}.${parts[1]}.${parts[2]}`;
      }
      // 이미 4자리인 경우 그대로 사용
      return dateStr;
    }
    // 3. MM.DD 형식 (올해)
    if (parts.length === 2) {
      return `${year}.${parts[0]}.${parts[1]}`;
    }
  }

  // 그 외 형식은 그대로 반환
  return dateStr;
}

/**
 * 접속 URL 생성 함수
 * @param {number} page 페이지 번호
 * @param {Object} config 설정을 담은 객체 (BASE_URL, GALLERY_ID 등 필요)
 */
function buildTargetUrl(page, config) {
  const params = [
    `id=${config.GALLERY_ID}`,
    `list_num=${config.LIST_NUM}`,
    `sort_type=N`,
    `exception_mode=recommend`,
    `search_head=${config.SEARCH_HEAD}`,
    `page=${page}`
  ];
  return `${config.BASE_URL}?${params.join('&')}`;
}
