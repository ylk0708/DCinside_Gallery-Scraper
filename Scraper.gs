/**
 * 메인 스크래퍼 (최신 데이터 수집용)
 */

// 기본 설정 (창작/Bol of Fame) - 기존 호환성 유지
const CONFIG = {
  GALLERY_ID: 'rollthechess', 
  SEARCH_HEAD: 40,            // 말머리 (ex: 40: 창작)
  LIST_NUM: 100,              
  START_PAGE: 1,              
  MAX_PAGE: 30,               
  MIN_RECOMMEND: 100,         
  BASE_URL: 'https://gall.dcinside.com/mgallery/board/lists/' 
};

// Bol of Literature 설정
const CONFIG_LIT = {
  ...CONFIG,
  SEARCH_HEAD: 130,           // 말머리 (130: 볼문학)
  MIN_RECOMMEND: 50           // 최소 추천 수 50
};

/**
 * 기본 스크래퍼 - 현재 활성화된 시트에 대해 수행 (기존 동작 유지)
 */
function scrapeDCInside() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  executeScraping(CONFIG, sheet);
}

/**
 * Bol of Literature 스크래퍼 - 'Bol of Literature' 시트에 수행
 */
function scrapeBolLiterature() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = 'Bol of Literature';
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(['제목', '링크', '추천수', '작성자', '작성일', '수집일시']);
    sheet.setFrozenRows(1);
    console.log(`Created new sheet: ${sheetName}`);
  }
  
  executeScraping(CONFIG_LIT, sheet);
}

/**
 * 공통 스크래핑 실행 로직
 */
function executeScraping(config, sheet) {
  // 헤더 추가 (이미 있으면 건너뜀)
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['제목', '링크', '추천수', '작성자', '작성일', '수집일시']);
    sheet.setFrozenRows(1);
  }

  // 기존 링크와 행 번호 매핑 (추천수 업데이트를 위해)
  const linkRowMap = new Map();
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    // 링크(B열)만 가져옴
    const linkValues = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    linkValues.forEach((row, index) => {
      if (row[0]) {
        const link = row[0].toString();
        const idMatch = link.match(/no=(\d+)/);
        const id = idMatch ? idMatch[1] : link;
        linkRowMap.set(id, index + 2);
      }
    });
  }

  const newPosts = [];
  const updates = [];

  for (let page = config.START_PAGE; page <= config.MAX_PAGE; page++) {
    // Utils.gs의 shared function 사용
    const url = buildTargetUrl(page, config);

    console.log(`Fetching Page ${page}: ${url}`);

    try {
      const options = {
        'method': 'get',
        'muteHttpExceptions': true,
        'headers': {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      };

      const response = UrlFetchApp.fetch(url, options);
      const html = response.getContentText();

      const posts = parsePosts(html, config);

      posts.forEach(post => {
        const idMatch = post.link.match(/no=(\d+)/);
        const id = idMatch ? idMatch[1] : post.link;

        if (linkRowMap.has(id)) {
          const rowIndex = linkRowMap.get(id);
          if (rowIndex !== -1) {
            updates.push({
              row: rowIndex,
              recommend: post.recommend
            });
          }
        } else {
          newPosts.push(post);
          linkRowMap.set(id, -1);
        }
      });

      Utilities.sleep(1000);

    } catch (e) {
      console.error(`Error fetching page ${page}: ${e.toString()}`);
    }
  }

  // 1. 기존 게시물 추천수 업데이트
  if (updates.length > 0) {
    console.log(`${updates.length}개의 기존 게시물 추천수를 최신화합니다.`);
    updates.forEach(item => {
      sheet.getRange(item.row, 3).setValue(item.recommend);
    });
  }

  // 2. 신규 게시물 상단 삽입
  if (newPosts.length > 0) {
    const rows = newPosts.map(post => [
      post.title,
      post.link,
      post.recommend,
      post.author,
      post.date,
      new Date()
    ]);

    sheet.insertRows(2, rows.length);
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);

    console.log(`${newPosts.length}개의 신규 게시물을 수집하여 상단에 추가했습니다.`);
  } else {
    console.log('새로운 게시물을 찾지 못했습니다.');
  }
}

/**
 * HTML에서 게시물 정보를 추출하는 함수
 */
function parsePosts(html, config) {
  const posts = [];

  const tbodyMatch = html.match(/<tbody class="listwrap2[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return [];
  const tbodyContent = tbodyMatch[1];

  const rowRegex = /<tr class="ub-content us-post"[\s\S]*?<\/tr>/gi;
  const rows = tbodyContent.match(rowRegex);

  if (!rows) return [];

  rows.forEach(row => {
    try {
      // 추천수 추출
      const recommendMatch = row.match(/<td class="gall_recommend">(\d+)<\/td>/);
      const recommend = recommendMatch ? parseInt(recommendMatch[1], 10) : 0;

      // 설정된 최소 추천수 조건 확인
      if (recommend >= config.MIN_RECOMMEND) {

        // 제목 & 링크 추출
        const titleLinkMatch = row.match(/<a\s+href="([^"]+)"[^>]*>[\s\S]*?<\/em>(.*?)<\/a>/i);
        let link = '';
        let title = '';

        if (titleLinkMatch) {
          link = 'https://gall.dcinside.com' + titleLinkMatch[1].replace(/&amp;/g, '&');
          title = titleLinkMatch[2].replace(/<span class="spoiler">.*?<\/span>/g, '').replace(/<\/?[^>]+(>|$)/g, '').trim();
        }

        // 작성자 추출
        const authorMatch = row.match(/data-nick="([^"]+)"/);
        const author = authorMatch ? authorMatch[1] : 'Unknown';

        const dateMatch = row.match(/<td class="gall_date"[^>]*>(.*?)<\/td>/);
        const rawDate = dateMatch ? dateMatch[1].trim() : '';
        const date = normalizeDate(rawDate);

        if (title && link) {
          posts.push({
            title: title,
            link: link,
            recommend: recommend,
            author: author,
            date: date
          });
        }
      }
    } catch (e) {
      console.warn('Row parsing error:', e);
    }
  });

  return posts;
}

