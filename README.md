# ezDOM v1.1.4 사용방법

---

## 개요

ezDOM은 HTML 요소를 자동으로 수집하여 JavaScript 객체처럼 읽고 쓸 수 있게 해주는 DOM 조작 라이브러리입니다.  
선택자로 지정된 요소들을 key-value 형태로 관리하며, 텍스트·값·스타일·이벤트를 안전하게 제어합니다.

---

## 시작 방법

### 1. 스크립트 로드

```html
<script src="ezDOMv1_1_4.js"></script>
```

또는 Node.js 환경에서:

```js
const ezDOM = require('./ezDOMv1_1_4.js');
```

### 2. 인스턴스 생성

```js
const ui = ezDOM();
```

기본 설정으로 생성 시 `document.body` 전체에서 `[data-ui]` 속성이 있는 요소를 수집합니다.

---

## HTML 요소 지정 방법

ezDOM이 요소를 수집하도록 HTML에 `data-ui` 속성을 추가합니다.

```html
<button data-ui="submitBtn">제출</button>
<input data-ui="nameInput" type="text" />
<span data-ui="statusMsg">대기 중</span>
```

`data-ui` 값이 요소의 접근 key가 됩니다.

---

## 초기화 옵션

```js
const ui = ezDOM({
  root: document.getElementById('app'),  // 수집 범위 지정 (기본: document.body)
  selector: '[data-ui]',                 // 수집 선택자 (기본: [data-ui])
  autoObserve: true,                     // DOM 변경 자동 감지 여부 (기본: false)
  activeAlias: true,                     // is-active 클래스도 active로 인식 (기본: false)
  strictSelectValue: true,               // select 존재하지 않는 value 차단 (기본: true)
  allowUnsafeHtml: false,                // innerHTML 허용 여부 (기본: false)
  allowHtmlRead: false,                  // innerHTML 읽기 허용 여부 (기본: false)
  allowUnsafeStyle: false,               // style 검증 완화 여부 (기본: false)
  allowUnsafeClassName: false,           // className 검증 완화 여부 (기본: false)
});
```

> `*`, `html`, `body`는 selector로 사용할 수 없습니다.

---

## 기본 속성 읽기 / 쓰기

수집된 요소는 `ui.키이름.속성` 형태로 접근합니다.

| 속성 | 읽기 | 쓰기 | 설명 |
|---|---|---|---|
| `text` | ✅ | ✅ | 요소의 텍스트 내용 |
| `value` | ✅ | ✅ | input/select/textarea의 값 |
| `hidden` | ✅ | ✅ | 숨김 여부 (true: 숨김) |
| `className` | ✅ | ✅ | 클래스 전체 문자열 |
| `id` | ✅ | ✅ | 요소의 id |
| `color` | ✅ | ✅ | 글자 색상 |
| `backgroundColor` | ✅ | ✅ | 배경 색상 |
| `size` | ✅ | ✅ | 글자 크기 |
| `weight` | ✅ | ✅ | 글자 굵기 |
| `family` | ✅ | ✅ | 글꼴 |
| `align` | ✅ | ✅ | 텍스트 정렬 |
| `display` | ✅ | ✅ | display 속성 |
| `isDetached` | ✅ | ❌ | DOM에서 제거됐는지 여부 |
| `element` | ✅ | ❌ | 원본 DOM 요소 직접 접근 |
| `html` | 옵션 필요 | 옵션 필요 | innerHTML (위험, 아래 참고) |

```js
// 텍스트 읽기
const msg = ui.statusMsg.text;

// 텍스트 쓰기
ui.statusMsg.text = '완료';

// 값 읽기/쓰기
const name = ui.nameInput.value;
ui.nameInput.value = '홍길동';

// 숨기기 / 보이기
ui.statusMsg.hidden = true;
ui.statusMsg.hidden = false;

// 색상 변경
ui.statusMsg.color = '#ff0000';
ui.statusMsg.backgroundColor = 'rgba(0,0,0,0.5)';
```

---

## 객체로 한 번에 여러 속성 설정

```js
ui.statusMsg = {
  text: '처리 중',
  color: '#333',
  hidden: false
};
```

---

## 요소 유형별 추가 속성

### input (텍스트 입력)

| 속성/메서드 | 설명 |
|---|---|
| `disabled` | 비활성화 여부 읽기/쓰기 |
| `onInput(fn)` | 입력 시 이벤트 등록 |
| `onChange(fn)` | 변경 시 이벤트 등록 |
| `onKeydown(fn)` | 키다운 시 이벤트 등록 |

```js
ui.nameInput.disabled = true;
ui.nameInput.onInput(e => console.log(e.target.value));
```

### checkbox / radio

| 속성/메서드 | 설명 |
|---|---|
| `checked` | 체크 여부 읽기/쓰기 |
| `disabled` | 비활성화 여부 읽기/쓰기 |
| `toggle()` | 체크 상태 반전 |
| `onChange(fn)` | 변경 시 이벤트 등록 |

```js
ui.agreeCheck.checked = true;
ui.agreeCheck.toggle();
```

### select (드롭다운)

| 속성/메서드 | 설명 |
|---|---|
| `value` | 선택된 값 읽기/쓰기 |
| `selectedIndex` | 선택된 인덱스 읽기/쓰기 |
| `options` | option 목록 배열 |
| `disabled` | 비활성화 여부 읽기/쓰기 |
| `onChange(fn)` | 변경 시 이벤트 등록 |

```js
ui.categorySelect.value = 'food';
ui.categorySelect.selectedIndex = 0;
```

> 존재하지 않는 value 설정은 기본적으로 차단됩니다. `strictSelectValue: false` 설정 시 해제됩니다.

### textarea

| 속성/메서드 | 설명 |
|---|---|
| `value` | 내용 읽기/쓰기 |
| `disabled` | 비활성화 여부 읽기/쓰기 |
| `onInput(fn)` | 입력 시 이벤트 등록 |
| `onChange(fn)` | 변경 시 이벤트 등록 |
| `onKeydown(fn)` | 키다운 시 이벤트 등록 |

### button

| 속성/메서드 | 설명 |
|---|---|
| `label` | 버튼 텍스트 읽기 |
| `disabled` | 비활성화 여부 읽기/쓰기 |
| `active` | active 클래스 여부 읽기/쓰기 |
| `click()` | 클릭 실행 |
| `enable()` | 활성화 |
| `disable()` | 비활성화 |
| `onHold(fn, options)` | 길게 누르기 이벤트 등록 |

```js
ui.submitBtn.disable();
ui.submitBtn.active = true;
ui.submitBtn.click();
```

#### onHold 옵션

```js
ui.submitBtn.onHold(e => {
  console.log(e.phase); // 'start' 또는 'repeat'
}, {
  firstDelay: 300,      // 반복 시작 전 대기 시간 (ms, 기본: 300)
  interval: 80,         // 반복 간격 (ms, 기본: 80)
  triggerOnStart: true, // 누르는 즉시 첫 실행 여부 (기본: true)
  preventDefault: true  // 기본 이벤트 차단 여부 (기본: true)
});
```

> `onHold()`는 전역 이벤트를 함께 등록합니다. 사용 후 반드시 unsubscribe 또는 `offAll()`을 호출해야 합니다.

### img (이미지)

| 속성 | 설명 |
|---|---|
| `src` | 이미지 URL 읽기/쓰기 |
| `alt` | 대체 텍스트 읽기/쓰기 |

```js
ui.profileImg.src = 'https://example.com/photo.jpg';
ui.profileImg.alt = '프로필 사진';
```

> `data:`, `javascript:` 등의 URL은 차단됩니다. `http:`, `https:`, 상대경로만 허용됩니다.

### a (앵커/링크)

| 속성 | 설명 |
|---|---|
| `href` | 링크 URL 읽기/쓰기 |
| `target` | 열기 방식 읽기/쓰기 |

```js
ui.homeLink.href = 'https://example.com';
ui.homeLink.target = '_blank'; // _self, _blank, _parent, _top 허용
```

> `target="_blank"` 설정 시 `rel="noopener noreferrer"`가 자동으로 적용됩니다.

---

## 공통 메서드

모든 요소 유형에서 사용 가능합니다.

| 메서드 | 설명 |
|---|---|
| `show()` | 요소 표시 |
| `hide()` | 요소 숨김 |
| `focus()` | 포커스 이동 |
| `blur()` | 포커스 해제 |
| `addClass('클래스명')` | 클래스 추가 |
| `removeClass('클래스명')` | 클래스 제거 |
| `toggleClass('클래스명')` | 클래스 토글 |
| `on('이벤트', fn)` | 이벤트 등록 |
| `off('이벤트', fn)` | 이벤트 제거 |
| `onClick(fn)` | 클릭 이벤트 등록 |
| `offAll()` | 등록된 모든 이벤트 제거 |

```js
ui.submitBtn.show();
ui.submitBtn.addClass('loading');
ui.submitBtn.onClick(() => console.log('클릭'));

const unsubscribe = ui.submitBtn.onClick(() => {});
unsubscribe(); // 이벤트 해제
```

---

## 자식 요소가 있는 요소 ($raw / $text)

자식 요소를 포함하는 요소(`child` 타입)는 추가 속성을 제공합니다.

| 속성 | 설명 |
|---|---|
| `$text` | 자신의 직접 텍스트 노드만 읽기/쓰기 |
| `$raw` | 자식 요소 구조 전체를 객체로 반환 |

```js
// $raw 예시 (span > strong, em 구조)
const raw = ui.cardItem.$raw;
// { text: '전체 텍스트', value: ..., strong: '굵은 텍스트', em: '기울임 텍스트', ... }
```

---

## 인스턴스 전역 속성

| 속성/메서드 | 설명 |
|---|---|
| `$keys` | 수집된 key 목록 배열 |
| `$list` | 수집된 전체 항목 raw store |
| `$groups` | 같은 key를 가진 요소를 그룹으로 묶은 proxy 객체 |
| `$groupsRaw` | 그룹 raw 데이터 |
| `$debug` | 수집 정보 디버그 목록 |
| `$dump()` | 현재 상태 스냅샷 배열 반환 |
| `$refresh()` | DOM 재수집 (수동 갱신) |
| `$observer` | 현재 MutationObserver 인스턴스 |
| `$disconnectObserver()` | MutationObserver 해제 |

```js
console.log(ui.$keys);     // ['submitBtn', 'nameInput', ...]
console.log(ui.$debug);    // 수집 결과 상세 목록
console.log(ui.$dump());   // 현재 값/상태 스냅샷

ui.$refresh();             // DOM 변경 후 수동 재수집
```

---

## autoObserve 사용 시 주의사항

`autoObserve: true`로 설정하면 DOM 변경을 자동으로 감지하여 재수집합니다.  
화면 전환, root 요소 제거, 컴포넌트 제거 시 반드시 observer를 해제해야 합니다.

```js
ui.$disconnectObserver();
```

해제하지 않으면 불필요한 감시가 지속됩니다.

---

## HTML 쓰기 (innerHTML, 위험 옵션)

기본적으로 `html` 속성 쓰기는 차단됩니다.  
아래 옵션을 활성화해야 사용할 수 있습니다.

```js
const ui = ezDOM({
  allowUnsafeHtml: true,
  htmlValidator: (html, el) => {
    // 검증 로직 작성 후 true 반환 시 허용
    return true;
  }
});

ui.statusMsg.html = '<strong>완료</strong>';
```

> 외부 입력값을 검증 없이 직접 사용하면 XSS 보안 취약점이 발생할 수 있습니다.

---

## key 생성 우선순위

요소의 접근 key는 아래 순서로 자동 결정됩니다.

1. `data-ui` 속성값
2. `id` 속성값
3. `className` 값
4. 텍스트 내용
5. `태그명 + index`

`keyPolicy` 옵션으로 직접 key 생성 함수를 지정할 수 있습니다.

```js
const ui = ezDOM({
  keyPolicy: (el, index, info) => {
    return info.dataUi || info.id || `item_${index}`;
  }
});
```

---

## 같은 key가 여러 요소에 존재하는 경우

`ui.키이름`은 첫 번째 요소를 반환합니다.  
모든 요소에 접근하려면 `$groups`를 사용합니다.

```js
const group = ui.$groups.itemCard;
group.forEach(el => {
  el.text = '업데이트됨';
});
```

---

## 스타일 검증 허용 범위

기본 상태에서 허용되는 스타일 값의 범위입니다.

| 속성 | 허용 값 예시 |
|---|---|
| `color` / `backgroundColor` | `#fff`, `rgb(...)`, `red`, `transparent` 등 |
| `size` | `16px`, `1rem`, `50%` 등 단위 포함 값 |
| `weight` | `normal`, `bold`, `700` 등 |
| `family` | 영문·숫자·공백 포함 글꼴명 |
| `align` | `left`, `center`, `right`, `justify` 등 |
| `display` | `none`, `block`, `flex`, `grid` 등 |

위 외의 값은 기본적으로 차단됩니다. `allowUnsafeStyle: true` 설정 시 검증이 해제됩니다.

---

## 버전 확인

```js
console.log(ezDOM.version); // '1.1.4'
```

---

## 유틸리티 함수

`ezDOM.utils`를 통해 내부 유틸리티 함수를 직접 사용할 수 있습니다.

| 함수 | 설명 |
|---|---|
| `normalizeText(str)` | 공백 정규화 |
| `toCamelCase(str)` | camelCase 변환 |
| `buildKeyFromElement(el, index, options)` | 요소의 key 생성 |
| `detectElementType(el)` | 요소 유형 감지 |
| `isSafeUrl(value, protocols)` | URL 안전 여부 확인 |
| `isSafeClassName(value, options)` | className 안전 여부 확인 |
| `isSafeSingleClassName(value, options)` | 단일 className 안전 여부 확인 |
| `isSafeStyleValue(prop, value, options)` | style 값 안전 여부 확인 |

---

## 주의사항

- `element` 속성으로 원본 DOM에 직접 접근하면 안전 setter를 우회할 수 있습니다.
- `on()`, `onClick()`, `onHold()` 등록 후 사용하지 않는 이벤트는 반드시 해제해야 합니다.
- `hide()` 후 `show()`는 `hide()` 시점의 inline display 값으로 복원됩니다. 외부 CSS로 숨겨진 요소는 `show()`로 노출될 수 있습니다.
- 보안 옵션(`allowUnsafeHtml`, `allowUnsafeStyle`, `allowUnsafeClassName`) 활성화로 인해 발생하는 문제는 사용자 책임입니다.