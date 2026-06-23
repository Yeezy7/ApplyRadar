// 表单字段识别规则（无 AI 降级方案）
// Content script 不支持 ES module，通过 window.ApplyRadarForms 暴露 API

(function () {
  const FIELD_PATTERNS = {
  full_name: {
    selectors: [
      "input[name*='name' i]:not([name*='company' i]):not([name*='job' i]):not([name*='school' i])",
      "input[name*='姓名']",
      "input[name*='realname']",
      "input[name*='username' i]",
      "input[id*='name' i]:not([id*='company' i]):not([id*='job' i])",
      "input[placeholder*='姓名']",
      "input[placeholder*='名字']",
    ],
    labels: ["姓名", "名字", "真实姓名", "name", "full name", "real name"],
    patterns: [/姓\s*名/, /真实\s*姓名/, /full\s*name/i, /real\s*name/i],
  },
  phone: {
    selectors: [
      "input[type='tel']",
      "input[name*='phone' i]",
      "input[name*='mobile' i]",
      "input[name*='手机']",
      "input[name*='电话']",
      "input[id*='phone' i]",
      "input[id*='mobile' i]",
      "input[placeholder*='手机']",
      "input[placeholder*='电话']",
      "input[placeholder*='phone' i]",
    ],
    labels: ["手机", "电话", "手机号", "联系电话", "phone", "mobile", "cell phone"],
    patterns: [/手\s*机/, /电\s*话/, /联系\s*电话/, /phone/i, /mobile/i],
  },
  email: {
    selectors: [
      "input[type='email']",
      "input[name*='email' i]",
      "input[name*='邮箱']",
      "input[name*='邮件']",
      "input[id*='email' i]",
      "input[placeholder*='邮箱']",
      "input[placeholder*='email' i]",
    ],
    labels: ["邮箱", "邮件", "电子邮件", "email", "e-mail"],
    patterns: [/邮\s*箱/, /电子\s*邮件/, /email/i, /e-mail/i],
  },
  gender: {
    selectors: [
      "select[name*='gender' i]",
      "select[name*='sex' i]",
      "select[name*='性别']",
      "input[name*='gender' i]",
      "input[name*='sex' i]",
      "input[name*='性别']",
    ],
    labels: ["性别", "gender", "sex"],
    patterns: [/性\s*别/, /^gender$/i, /^sex$/i],
  },
  birth_date: {
    selectors: [
      "input[name*='birth' i]",
      "input[name*='birthday' i]",
      "input[name*='出生']",
      "input[name*='年龄']",
      "input[type='date'][name*='birth' i]",
      "input[placeholder*='出生']",
      "input[placeholder*='birthday' i]",
    ],
    labels: ["出生日期", "出生年月", "生日", "年龄", "birth", "birthday", "date of birth"],
    patterns: [/出\s*生/, /生\s*日/, /birthday/i, /birth\s*date/i],
  },
  education: {
    selectors: [
      "select[name*='education' i]",
      "select[name*='degree' i]",
      "select[name*='学历']",
      "select[name*='学力']",
    ],
    labels: ["学历", "最高学历", "education", "degree"],
    patterns: [/学\s*历/, /^education$/i, /^degree$/i],
  },
  school: {
    selectors: [
      "input[name*='school' i]",
      "input[name*='university' i]",
      "input[name*='学校']",
      "input[name*='院校']",
      "input[placeholder*='学校']",
      "input[placeholder*='school' i]",
    ],
    labels: ["学校", "毕业院校", "学校名称", "school", "university"],
    patterns: [/学\s*校/, /院校/, /^school$/i, /^university$/i],
  },
  major: {
    selectors: [
      "input[name*='major' i]",
      "input[name*='专业']",
      "input[placeholder*='专业']",
      "input[placeholder*='major' i]",
    ],
    labels: ["专业", "所学专业", "major"],
    patterns: [/专\s*业/, /^major$/i],
  },
  work_company: {
    selectors: [
      "input[name*='company' i]",
      "input[name*='employer' i]",
      "input[name*='公司']",
      "input[name*='单位']",
      "input[placeholder*='公司']",
      "input[placeholder*='company' i]",
    ],
    labels: ["公司", "公司名称", "工作单位", "company", "employer"],
    patterns: [/公\s*司/, /工作\s*单位/, /^company$/i, /^employer$/i],
  },
  work_title: {
    selectors: [
      "input[name*='title' i]:not([name*='page' i])",
      "input[name*='position' i]",
      "input[name*='职位']",
      "input[name*='岗位']",
      "input[placeholder*='职位']",
      "input[placeholder*='position' i]",
    ],
    labels: ["职位", "岗位", "职位名称", "title", "position"],
    patterns: [/职\s*位/, /岗\s*位/, /^title$/i, /^position$/i],
  },
  target_position: {
    selectors: [
      "select[name*='position' i]",
      "select[name*='job' i]",
      "select[name*='职位']",
      "select[name*='岗位']",
      "input[name*='expect' i]",
      "input[name*='意向']",
    ],
    labels: ["求职意向", "期望职位", "目标职位", "expected position"],
    patterns: [/求职\s*意向/, /期望\s*职位/, /目标\s*职位/],
  },
};

// 从 DOM 中识别表单字段
function detectFormFields() {
  const fields = [];
  const inputs = document.querySelectorAll('input, select, textarea');

  for (const input of inputs) {
    if (input.type === 'hidden' || input.type === 'submit' || input.type === 'button') {
      continue;
    }

    const fieldInfo = identifyField(input);
    if (fieldInfo) {
      fields.push({
        ...fieldInfo,
        element: input,
        selector: generateSelector(input),
      });
    }
  }

  return fields;
}

// 识别单个字段
function identifyField(element) {
  const tagName = element.tagName.toLowerCase();
  const type = element.type || 'text';
  const name = (element.name || '').toLowerCase();
  const id = (element.id || '').toLowerCase();
  const placeholder = (element.placeholder || '').toLowerCase();
  const ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();

  // 获取关联的 label 文本
  const labelText = getLabelForElement(element).toLowerCase();

  // 组合所有属性用于匹配
  const allAttrs = `${name} ${id} ${placeholder} ${ariaLabel} ${labelText}`;

  for (const [fieldName, config] of Object.entries(FIELD_PATTERNS)) {
    // 检查 CSS 选择器
    for (const selector of config.selectors) {
      try {
        if (element.matches(selector)) {
          return { fieldName, confidence: 0.9, method: 'selector' };
        }
      } catch {}
    }

    // 检查标签文本
    for (const label of config.labels) {
      if (allAttrs.includes(label.toLowerCase())) {
        return { fieldName, confidence: 0.8, method: 'label' };
      }
    }

    // 检查正则模式
    for (const pattern of config.patterns) {
      if (pattern.test(allAttrs) || pattern.test(labelText)) {
        return { fieldName, confidence: 0.7, method: 'pattern' };
      }
    }
  }

  return null;
}

// 获取元素关联的 label 文本
function getLabelForElement(element) {
  // 方法1: 通过 for 属性关联
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label) return label.textContent.trim();
  }

  // 方法2: 父元素是 label
  const parentLabel = element.closest('label');
  if (parentLabel) {
    // 获取 label 的直接文本（排除子元素文本）
    const clone = parentLabel.cloneNode(true);
    clone.querySelectorAll('input, select, textarea').forEach(el => el.remove());
    const text = clone.textContent.trim();
    if (text) return text;
  }

  // 方法3: 查找前一个兄弟元素
  const prev = element.previousElementSibling;
  if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN' || prev.tagName === 'DIV')) {
    const text = prev.textContent.trim();
    if (text && text.length < 50) return text;
  }

  // 方法4: 查找父容器中的文本节点
  const container = element.parentElement;
  if (container) {
    for (const child of container.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent.trim();
        if (text && text.length < 50) return text;
      }
    }
  }

  return '';
}

// 生成元素的 CSS 选择器
function generateSelector(element) {
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }

  const parts = [];
  let current = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector = `#${CSS.escape(current.id)}`;
      parts.unshift(selector);
      break;
    }

    if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).slice(0, 2);
      if (classes.length > 0) {
        selector += '.' + classes.map(c => CSS.escape(c)).join('.');
      }
    }

    // 添加 nth-child 如果需要
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        c => c.tagName === current.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    parts.unshift(selector);
    current = current.parentElement;
  }

  return parts.join(' > ');
}

  // 暴露 API 到全局命名空间，供 content.js 使用
  window.ApplyRadarForms = window.ApplyRadarForms || {};
  Object.assign(window.ApplyRadarForms, {
    FIELD_PATTERNS,
    detectFormFields,
    identifyField,
  });
})();
