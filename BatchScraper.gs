/**
 * DC Inside 2025년 과거 데이터 수집기 (Batch Scraper)
 * 
 * 1. 이 코드를 `BatchScraper.gs`라는 새 파일로 만들어 붙여넣으세요.
 * 2. `Code.gs`와 별도로 실행됩니다.
 * 3. 메뉴에서 'DC Inside 2025 수집' > '과거 데이터 수집 시작'을 클릭하세요.
 */

// 배치 설정
const BATCH_CONFIG = {
  GALLERY_ID: 'rollthechess',
  SEARCH_HEAD: 40,
  LIST_NUM: 100,
  BATCH_SIZE: 50,       // 한 번 실행 시 최대 50페이지씩 끊어서 실행 (시간 초과 방지)
  MIN_RECOMMEND: 100,
  TARGET_YEAR: 2025     // 수집 목표 연도
};

function onOpenBatch() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('DC Inside 2025 수집')
    .addItem('과거 데이터 수집 시작 (이어하기)', 'scrapeBatch2025')
    .addItem('진행 상황 초기화', 'resetBatchProgress')
    .addToUi();
}

// 트리거 등으로 자동 실행되지 않도록 함수명 분리
function scrapeBatch2025() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const scriptProperties = PropertiesService.getScriptProperties();
  
  // 저장된 마지막 페이지 불러오기 (없으면 1페이지부터)
  let currentPage = parseInt(scriptProperties.getProperty('BATCH_LAST_PAGE')) || 1;
  const startPage = currentPage;
  
  // 헤더 확인 및 추가
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['제목', '링크', '추천수', '작성자', '작성일', '수집일시']);
    sheet.setFrozenRows(1);
  }

  // 중복 확인을 위한 기존 링크 로드 (B열)
  const existingLinks = new Set();
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const linkValues = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    linkValues.forEach(row => {
      if (row[0]) existingLinks.add(row[0].toString());
    });
  }

  let collectedCount = 0;
  let stopFlag = false; // 2024년 데이터를 만나면 종료하기 위한 플래그

  // 배치 사이즈만큼 반복
  for (let i = 0; i < BATCH_CONFIG.BATCH_SIZE; i++) {
    if (stopFlag) break;

    const url = `https://gall.dcinside.com/mgallery/board/lists/?id=${BATCH_CONFIG.GALLERY_ID}&list_num=${BATCH_CONFIG.LIST_NUM}&sort_type=N&exception_mode=recommend&search_head=${BATCH_CONFIG.SEARCH_HEAD}&page=${currentPage}`;
    
    console.log(`Fetching Batch Page ${currentPage}...`);
    
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
      
      // 게시물 파싱
      const result = parsePostsBatch(html, BATCH_CONFIG.MIN_RECOMMEND, BATCH_CONFIG.TARGET_YEAR);
      
      // 2025년 이전 데이터가 나오면 중단 플래그 설정
      if (result.foundOlderData) {
        stopFlag = true;
        console.log(`Page ${currentPage}에서 ${BATCH_CONFIG.TARGET_YEAR}년 이전 데이터 발견. 수집을 종료합니다.`);
      }
      
      const newPosts = [];
      result.posts.forEach(post => {
        if (!existingLinks.has(post.link)) {
          newPosts.push([
            post.title,
            post.link,
            post.recommend,
            post.author,
            post.date,
            new Date()
          ]);
          existingLinks.add(post.link); // 현재 배치 내 중복 방지
        }
      });
      
      // 시트에 기록
      if (newPosts.length > 0) {
        sheet.getRange(sheet.getLastRow() + 1, 1, newPosts.length, newPosts[0].length).setValues(newPosts);
        collectedCount += newPosts.length;
      }
      
      // 마지막 페이지 업데이트
      if (!stopFlag) {
        currentPage++;
        scriptProperties.setProperty('BATCH_LAST_PAGE', currentPage.toString());
      }

      Utilities.sleep(1000); // 1초 대기
      
    } catch (e) {
      console.error(`Error on page ${currentPage}: ${e.toString()}`);
      SpreadsheetApp.getUi().alert(`오류 발생 (페이지 ${currentPage}): ${e.toString()}`);
      break; // 오류 발생 시 중단
    }
  }
  
  // 결과 알림
  const ui = SpreadsheetApp.getUi();
  if (stopFlag) {
     ui.alert(`수집 완료/종료!\n\n${BATCH_CONFIG.TARGET_YEAR}년 데이터 수집을 모두 마쳤습니다.\n마지막 페이지: ${currentPage}\n총 ${collectedCount}개 추가됨.`);
     // 초기화
     scriptProperties.deleteProperty('BATCH_LAST_PAGE');
  } else {
     ui.alert(`배치 완료 (페이지 ${startPage} ~ ${currentPage - 1})\n\n새로 추가된 게시물: ${collectedCount}개\n\n아직 2025년 데이터가 남았을 수 있습니다.\n메뉴에서 '과거 데이터 수집 시작'을 다시 눌러주세요.`);
  }
}

function resetBatchProgress() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('경고', '진행 상황을 초기화하시겠습니까? 다시 1페이지부터 시작하게 됩니다.', ui.ButtonSet.YES_NO);
  
  if (response == ui.Button.YES) {
    PropertiesService.getScriptProperties().deleteProperty('BATCH_LAST_PAGE');
    ui.alert('초기화되었습니다.');
  }
}

function parsePostsBatch(html, minRecommend, targetYear) {
  const posts = [];
  let foundOlderData = false;
  
  const tbodyMatch = html.match(/<tbody class="listwrap2[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return { posts: [], foundOlderData: false };
  
  const rowRegex = /<tr class="ub-content us-post"[\s\S]*?<\/tr>/gi;
  const rows = tbodyMatch[1].match(rowRegex);
  
  if (!rows) return { posts: [], foundOlderData: false };
  
  const now = new Date();
  const currentYear = now.getFullYear(); // 2025 (시스템 시간 가정)

  rows.forEach(row => {
    try {
      // 날짜 추출
      // <td class="gall_date" ...>12.31</td> 또는 13:22
      const dateMatch = row.match(/<td class="gall_date"[^>]*>(.*?)<\/td>/);
      let dateStr = dateMatch ? dateMatch[1].trim() : '';
      let postYear = currentYear;
      
      // 날짜 파싱 로직
      if (dateStr.includes(':')) {
        // HH:mm 형식이면 오늘(또는 최근)로 간주 -> 2025
        postYear = currentYear;
      } else if (dateStr.includes('.')) { // YY.MM.DD 또는 MM.DD
         const parts = dateStr.split('.');
         if (parts.length === 3) {
           // 24.12.31 (YY.MM.DD)
           postYear = 2000 + parseInt(parts[0], 10);
         } else {
           // 12.31 (MM.DD) -> 같은 해로 간주 (단, 1월에 12월글이 보이면 작년일 수 있으나 여기선 단순화)
           // 보통 DC는 올해 글은 MM.DD, 작년 글은 YY.MM.DD로 표시함
           // 따라서 점이 있지만 년도가 없으면 올해로 간주
           postYear = currentYear;
         }
      } else if (dateStr.includes('/')) { // 가끔 슬래시 쓰는 경우 24/12/31
         const parts = dateStr.split('/');
         if (parts.length === 3) { // YY/MM/DD
            postYear = 2000 + parseInt(parts[0], 10);
         }
      } else if (dateStr.includes('-')) {
          // YY-MM-DD
         const parts = dateStr.split('-');
         if (parts.length === 3) { 
            postYear = 2000 + parseInt(parts[0], 10);
         }
      }
      
      // 연도 필터링
      if (postYear < targetYear) {
        foundOlderData = true;
        return; // 현재 루프 건너뜀 (이미 older flag 켰으니 이후 루프에서도 계속 older일 가능성 높음)
      } else if (postYear > targetYear) {
        return; // 미래 날짜? 무시
      }

      // 추천수 체크
      const recommendMatch = row.match(/<td class="gall_recommend">(\d+)<\/td>/);
      const recommend = recommendMatch ? parseInt(recommendMatch[1], 10) : 0;
      
      if (recommend >= minRecommend) {
        const titleLinkMatch = row.match(/<a\s+href="([^"]+)"[^>]*>[\s\S]*?<\/em>(.*?)<\/a>/i);
        if (titleLinkMatch) {
          const link = 'https://gall.dcinside.com' + titleLinkMatch[1].replace(/&amp;/g, '&');
          // 스포일러 태그 및 기타 HTML 태그 제거
          const title = titleLinkMatch[2].replace(/<span class="spoiler">.*?<\/span>/g, '').replace(/<\/?[^>]+(>|$)/g, '').trim();
          
          const authorMatch = row.match(/data-nick="([^"]+)"/);
          const author = authorMatch ? authorMatch[1] : 'Unknown';
          
          posts.push({
            title: title,
            link: link,
            recommend: recommend,
            author: author,
            date: normalizeDate(dateStr)
          });
        }
      }
    } catch (e) {
      console.warn('Row parsing error:', e);
    }
  });
  
  return { posts, foundOlderData };
}

/**
 * 날짜 문자열 정규화 (YYYY.MM.DD 형태로 변환)
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
    return `${year}.${month}.${day} ${dateStr}`;
  }
  
  // 2. YY.MM.DD 또는 YYYY.MM.DD
  if (dateStr.includes('.')) {
    const parts = dateStr.split('.');
    if (parts.length === 3) {
      // 연도가 2자리인 경우 (예: 24.12.31)
      if (parts[0].length === 2) {
        return `20${parts[0]}.${parts[1]}.${parts[2]}`;
      }
      return dateStr;
    }
    // 3. MM.DD 형식 (올해)
    if (parts.length === 2) {
      return `${year}.${parts[0]}.${parts[1]}`;
    }
  }
  
  return dateStr;
}
