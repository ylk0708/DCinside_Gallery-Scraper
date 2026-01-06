/**
 * DC Inside 2025년 과거 데이터 수집기 (Batch Scraper)
 * 
 * 1. 이 코드를 `BatchScraper.gs`라는 새 파일로 만들어 붙여넣으세요.
 * 2. `Code.gs`와 별도로 실행됩니다.
 * 3. 메뉴에서 'DC Inside 2025 수집' > '과거 데이터 수집 시작'을 클릭하세요.
 */

// 배치 설정 (창작/Bol of Fame)
const BATCH_CONFIG_FAME = {
  GALLERY_ID: 'rollthechess',
  SEARCH_HEAD: 40,
  LIST_NUM: 100,
  BATCH_SIZE: 50,       // 한 번 실행 시 최대 50페이지씩 끊어서 실행 (시간 초과 방지)
  MIN_RECOMMEND: 100,
  TARGET_YEAR: 2025,    // 수집 목표 연도
  BASE_URL: 'https://gall.dcinside.com/mgallery/board/lists/'
};

// 배치 설정 (Bol of Literature)
const BATCH_CONFIG_LIT = {
  ...BATCH_CONFIG_FAME,
  SEARCH_HEAD: 130,     // 말머리 130: 볼문학
  MIN_RECOMMEND: 50     // 최소 추천 수 50
};

/**
 * 창작(Bol of Fame) 배치 스크랩 실행
 */
function scrapeBatchBolFame() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  // 기존 키 'BATCH_LAST_PAGE' 유지
  executeBatchScraping(BATCH_CONFIG_FAME, 'BATCH_LAST_PAGE', sheet);
}

/**
 * Bol of Literature 배치 스크랩 실행
 */
function scrapeBatchBolLiterature() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = 'Bol of Literature';
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(['제목', '링크', '추천수', '작성자', '작성일', '수집일시']);
    sheet.setFrozenRows(1);
    console.log(`Created new sheet: ${sheetName}`);
  }
  
  executeBatchScraping(BATCH_CONFIG_LIT, 'BATCH_LAST_PAGE_LIT', sheet);
}


/**
 * 창작 진행 상황 초기화
 */
function resetBatchProgressFame() {
  resetBatchProgressInternal('BATCH_LAST_PAGE', '창작');
}

/**
 * Bol 문학 진행 상황 초기화
 */
function resetBatchProgressLit() {
  resetBatchProgressInternal('BATCH_LAST_PAGE_LIT', 'Bol 문학');
}

function resetBatchProgressInternal(key, title) {
  PropertiesService.getScriptProperties().deleteProperty(key);
  console.log(`${title} 진행 상황이 초기화되었습니다.`);
}

/**
 * 공통 배치 스크래핑 로직
 */
function executeBatchScraping(config, progressKey, sheet) {
  const scriptProperties = PropertiesService.getScriptProperties();
  
  // 저장된 마지막 페이지 불러오기 (없으면 1페이지부터)
  let currentPage = parseInt(scriptProperties.getProperty(progressKey)) || 1;
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
  let stopFlag = false; // 타겟 연도 이전 데이터를 만나면 종료하기 위한 플래그

  // 배치 사이즈만큼 반복
  for (let i = 0; i < config.BATCH_SIZE; i++) {
    if (stopFlag) break;

    // Utils.gs의 shared function 사용
    const url = buildTargetUrl(currentPage, config);
    
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
      const result = parsePostsBatch(html, config.MIN_RECOMMEND, config.TARGET_YEAR);
      
      // 타겟 연도 이전 데이터가 나오면 중단 플래그 설정
      if (result.foundOlderData) {
        stopFlag = true;
        console.log(`Page ${currentPage}에서 ${config.TARGET_YEAR}년 이전 데이터 발견. 수집을 종료합니다.`);
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
        scriptProperties.setProperty(progressKey, currentPage.toString());
      }

      Utilities.sleep(1000); // 1초 대기
      
    } catch (e) {
      console.error(`Error on page ${currentPage}: ${e.toString()}`);
      console.log(`오류 발생 (페이지 ${currentPage}): ${e.toString()}`);
      break; // 오류 발생 시 중단
    }
  }
  
  // 결과 알림
  if (stopFlag) {
     console.log(`수집 완료/종료! ${config.TARGET_YEAR}년 데이터 수집을 모두 마쳤습니다. 마지막 페이지: ${currentPage}, 총 ${collectedCount}개 추가됨.`);
     // 초기화
     scriptProperties.deleteProperty(progressKey);
  } else {
     console.log(`배치 완료 (페이지 ${startPage} ~ ${currentPage - 1}). 새로 추가된 게시물: ${collectedCount}개. 아직 ${config.TARGET_YEAR}년 데이터가 남았을 수 있습니다. 다시 실행해주세요.`);
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
  const currentYear = now.getFullYear(); 

  rows.forEach(row => {
    try {
      // 날짜 추출
      const dateMatch = row.match(/<td class="gall_date"[^>]*>(.*?)<\/td>/);
      let dateStr = dateMatch ? dateMatch[1].trim() : '';
      let postYear = currentYear;
      
      // 날짜 파싱 로직
      if (dateStr.includes(':')) {
        postYear = currentYear;
      } else if (dateStr.includes('.')) { 
         const parts = dateStr.split('.');
         if (parts.length === 3) {
           postYear = 2000 + parseInt(parts[0], 10);
         } else {
           postYear = currentYear;
         }
      } else if (dateStr.includes('/')) { 
         const parts = dateStr.split('/');
         if (parts.length === 3) { 
            postYear = 2000 + parseInt(parts[0], 10);
         }
      } else if (dateStr.includes('-')) {
         const parts = dateStr.split('-');
         if (parts.length === 3) { 
            postYear = 2000 + parseInt(parts[0], 10);
         }
      }
      
      // 연도 필터링
      if (postYear < targetYear) {
        foundOlderData = true;
        return; 
      } else if (postYear > targetYear) {
        return; 
      }

      // 추천수 체크
      const recommendMatch = row.match(/<td class="gall_recommend">(\d+)<\/td>/);
      const recommend = recommendMatch ? parseInt(recommendMatch[1], 10) : 0;
      
      if (recommend >= minRecommend) {
        const titleLinkMatch = row.match(/<a\s+href="([^"]+)"[^>]*>[\s\S]*?<\/em>(.*?)<\/a>/i);
        if (titleLinkMatch) {
          const link = 'https://gall.dcinside.com' + titleLinkMatch[1].replace(/&amp;/g, '&');
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

// normalizeDate와 buildTargetUrl 함수는 Utils.gs로 이동됨

