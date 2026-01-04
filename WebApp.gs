/**
 * DC Inside Scraper for Google Apps Script
 * 
 * 1. 이 코드를 복사하여 구글 스프레드시트의 확장 프로그램 > Apps Script에 붙여넣으세요.
 * 2. 스크립트 편집기에서 'DC Scraper' 메뉴가 나타나지 않으면 페이지를 새로고침하세요.
 * 3. 'DC Inside 크롤링' > '스크랩 시작' 메뉴를 클릭하여 실행합니다.
 */

/**
 * 웹앱 진입점 (GET 요청 처리)
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Bol Of Fame')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * 프론트엔드에서 호출하는 데이터 조회 API (전체 데이터 반환)
 * 클라이언트 사이드에서 필터링/정렬/페이지네이션 수행
 */
function getData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('Active Spreadsheet not found. Make sure the script is bound to a sheet.');

    const sheet = ss.getActiveSheet();
    const lastRow = sheet.getLastRow();

    console.log('getData called. LastRow:', lastRow);

    if (lastRow <= 1) {
      console.log('No data found (only header or empty).');
      return [];
    }

    // 데이터 전체 읽기 (헤더 제외: 2행부터)
    const dataRange = sheet.getRange(2, 1, lastRow - 1, 6);
    const rawData = dataRange.getValues();

    // 데이터 객체로 변환
    const items = rawData.map((row, index) => {
      try {
        return {
          title: String(row[0]),
          link: String(row[1]),
          recommend: Number(row[2]) || 0,
          author: String(row[3]),
          date: String(row[4]),
          // Date 객체는 JSON 전달 시 문자열로 변환됨을 명시적으로 처리
          scrapedAt: row[5] instanceof Date ? row[5].toISOString() : String(row[5])
        };
      } catch (err) {
        console.error('Row parsing error at index ' + index, err);
        return null;
      }
    }).filter(item => item !== null); // 에러 난 행 제외

    console.log(`Returning ${items.length} items.`);
    return items;

  } catch (e) {
    console.error('getData Error:', e.toString());
    // 에러 객체를 반환하여 클라이언트에서 알 수 있게 함 (배열이 아님)
    return { error: e.toString() };
  }
}
