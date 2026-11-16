// 테마 초기화 스크립트 (서버 layout 에서 <head> 에 넣음 — React 훅을 쓰지 않는 파일이어야 한다)
export const THEME_KEY = "trackit:theme";

/** 첫 그림 전에 <html data-theme> 을 넣는다 (깜빡임 방지). "시스템"이면 OS 설정이 바뀔 때 따라간다 */
export const THEME_INIT_SCRIPT = `(function(){try{var k="${THEME_KEY}",m=window.matchMedia("(prefers-color-scheme: dark)");function a(){var p=localStorage.getItem(k)||"system";document.documentElement.dataset.theme=p==="system"?(m.matches?"dark":"light"):p}a();m.addEventListener("change",a)}catch(e){}})();`;
