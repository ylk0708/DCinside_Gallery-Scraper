/**
 * 메인 스크래퍼 (최신 데이터 수집용)
 */

// 설정 변수
const CONFIG = {
  GALLERY_ID: 'rollthechess', // 갤러리 ID
  SEARCH_HEAD: 40,            // 말머리 (ex: 40: 창작, 130: 볼문학)
  LIST_NUM: 100,              // 한 페이지당 게시물 수
  START_PAGE: 1,              // 시작 페이지
  MAX_PAGE: 30,               // 최대 스크랩할 페이지 수 (너무 많이 하면 시간이 오래 걸릴 수 있습니다)
  MIN_RECOMMEND: 100,         // 최소 추천 수
  BASE_URL: 'https://gall.dcinside.com/mgallery/board/lists/' // 대상 URL (마이너 갤러리 기준)
};

function scrapeDCInside() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

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
      // 행 번호 = index + 2 (헤더 1행 + 0-based index)
      if (row[0]) {
        const link = row[0].toString();
        // 링크에서 'no' 파라미터(게시글 번호)만 추출하여 키로 사용
        const idMatch = link.match(/no=(\d+)/);
        const id = idMatch ? idMatch[1] : link;
        linkRowMap.set(id, index + 2);
      }
    });
  }

  const newPosts = [];
  const updates = [];

  for (let page = CONFIG.START_PAGE; page <= CONFIG.MAX_PAGE; page++) {
    // Utils.gs의 shared function 사용 (config 전달)
    const url = buildTargetUrl(page, CONFIG);

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

      const posts = parsePosts(html, page);

      posts.forEach(post => {
        // 현재 포스트의 ID 추출
        const idMatch = post.link.match(/no=(\d+)/);
        const id = idMatch ? idMatch[1] : post.link;

        if (linkRowMap.has(id)) {
          // 이미 존재하는 게시물이면 행 번호 확인
          const rowIndex = linkRowMap.get(id);
          if (rowIndex !== -1) {
            // 기존 시트에 있는 데이터라면 추천수 업데이트 대상에 추가
            updates.push({
              row: rowIndex,
              recommend: post.recommend
            });
          }
          // rowIndex가 -1이면 이번 실행에서 이미 newPosts에 추가된 것이므로 패스
        } else {
          // 새로운 게시물
          newPosts.push(post);
          linkRowMap.set(id, -1); // 신규 추가됨을 표시
        }
      });

      Utilities.sleep(1000);

    } catch (e) {
      console.error(`Error fetching page ${page}: ${e.toString()}`);
    }
  }

  // 1. 기존 게시물 추천수 업데이트 (신규 행 삽입 전에 수행해야 행 번호가 유지됨)
  if (updates.length > 0) {
    console.log(`${updates.length}개의 기존 게시물 추천수를 최신화합니다.`);
    updates.forEach(item => {
      // 3번째 컬럼(C열)이 추천수
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

    // 최신글이 상단에 오도록 2번째 행(헤더 다음)에 삽입
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
function parsePosts(html, page) {
  const posts = [];

  // 전체 HTML에서 <tbody>...</tbody> 안의 내용만 추출하여 검색 범위를 줄임 (선택사항이나 권장)
  const tbodyMatch = html.match(/<tbody class="listwrap2[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return [];
  const tbodyContent = tbodyMatch[1];

  // tr 단위로 분리 (간단하게 <tr class="ub-content us-post" 로 시작하는 부분을 찾음)
  const rowRegex = /<tr class="ub-content us-post"[\s\S]*?<\/tr>/gi;
  const rows = tbodyContent.match(rowRegex);

  if (!rows) return [];

  rows.forEach(row => {
    try {
      // 추천수 추출
      const recommendMatch = row.match(/<td class="gall_recommend">(\d+)<\/td>/);
      const recommend = recommendMatch ? parseInt(recommendMatch[1], 10) : 0;

      // 조건 확인 (추천수 100 이상)
      if (recommend >= CONFIG.MIN_RECOMMEND) {

        // 제목 & 링크 추출
        const titleLinkMatch = row.match(/<a\s+href="([^"]+)"[^>]*>[\s\S]*?<\/em>(.*?)<\/a>/i);
        let link = '';
        let title = '';

        if (titleLinkMatch) {
          link = 'https://gall.dcinside.com' + titleLinkMatch[1].replace(/&amp;/g, '&');
          // 스포일러 태그 등 HTML 태그 제거
          title = titleLinkMatch[2].replace(/<span class="spoiler">.*?<\/span>/g, '').replace(/<\/?[^>]+(>|$)/g, '').trim();
        }

        // 작성자 추출
        const authorMatch = row.match(/data-nick="([^"]+)"/);
        const author = authorMatch ? authorMatch[1] : 'Unknown';

        const dateMatch = row.match(/<td class="gall_date"[^>]*>(.*?)<\/td>/);
        const rawDate = dateMatch ? dateMatch[1].trim() : '';
        // Utils.gs의 normalizeDate 사용
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
