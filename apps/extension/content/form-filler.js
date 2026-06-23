// 表单填充模块
// Content script 不支持 ES module，通过 window.ApplyRadarForms 暴露 API

(function () {
  // 根据模板填充表单
  function fillForm(fields, resumeData, fieldMappings) {
  const results = [];

  for (const [resumeField, selector] of Object.entries(fieldMappings)) {
    const value = getResumeValue(resumeData, resumeField);
    if (!value) {
      results.push({ field: resumeField, success: false, reason: 'no_value' });
      continue;
    }

    const element = document.querySelector(selector);
    if (!element) {
      results.push({ field: resumeField, success: false, reason: 'no_element' });
      continue;
    }

    try {
      fillElement(element, value);
      results.push({ field: resumeField, success: true, value });
    } catch (e) {
      results.push({ field: resumeField, success: false, reason: e.message });
    }
  }

  return results;
}

// 直接用检测到的字段填充
function fillDetectedFields(detectedFields, resumeData) {
  const results = [];

  for (const field of detectedFields) {
    const value = getResumeValue(resumeData, field.fieldName);
    if (!value) {
      results.push({ field: field.fieldName, success: false, reason: 'no_value' });
      continue;
    }

    try {
      fillElement(field.element, value);
      results.push({ field: field.fieldName, success: true, value });
    } catch (e) {
      results.push({ field: field.fieldName, success: false, reason: e.message });
    }
  }

  return results;
}

// 获取简历数据中的值
function getResumeValue(data, fieldName) {
  // 直接字段
  if (data[fieldName] !== undefined && data[fieldName] !== null) {
    return String(data[fieldName]);
  }

  // 教育经历字段
  if (fieldName === 'school' && data.education?.length > 0) {
    return data.education[0].school;
  }
  if (fieldName === 'major' && data.education?.length > 0) {
    return data.education[0].major;
  }
  if (fieldName === 'education' && data.education?.length > 0) {
    return data.education[0].degree;
  }

  // 工作经历字段
  if (fieldName === 'work_company' && data.work_experience?.length > 0) {
    return data.work_experience[0].company;
  }
  if (fieldName === 'work_title' && data.work_experience?.length > 0) {
    return data.work_experience[0].title;
  }

  return null;
}

// 填充单个表单元素
function fillElement(element, value) {
  const tagName = element.tagName.toLowerCase();
  const type = (element.type || 'text').toLowerCase();

  // 触发 React/Vue 的值更新
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set;
  const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;
  const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype, 'value'
  )?.set;

  if (tagName === 'select') {
    // 处理下拉框
    fillSelectElement(element, value, nativeSelectValueSetter);
  } else if (tagName === 'textarea') {
    // 处理文本域
    if (nativeTextAreaValueSetter) {
      nativeTextAreaValueSetter.call(element, value);
    } else {
      element.value = value;
    }
    triggerEvents(element);
  } else if (type === 'radio') {
    // 处理单选框
    fillRadioButton(element, value);
  } else if (type === 'checkbox') {
    // 处理复选框
    fillCheckbox(element, value);
  } else {
    // 处理普通输入框
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(element, value);
    } else {
      element.value = value;
    }
    triggerEvents(element);
  }
}

// 填充下拉框
function fillSelectElement(select, value, nativeSetter) {
  const options = Array.from(select.options);
  const lowerValue = value.toLowerCase();

  // 尝试精确匹配
  let matched = options.find(opt =>
    opt.value === value || opt.textContent.trim() === value
  );

  // 尝试模糊匹配
  if (!matched) {
    matched = options.find(opt =>
      opt.value.toLowerCase().includes(lowerValue) ||
      opt.textContent.toLowerCase().includes(lowerValue)
    );
  }

  if (matched) {
    if (nativeSetter) {
      nativeSetter.call(select, matched.value);
    } else {
      select.value = matched.value;
    }
    triggerEvents(select);
  }
}

// 填充单选框
function fillRadioButton(radio, value) {
  const lowerValue = value.toLowerCase();
  const label = radio.parentElement?.textContent?.toLowerCase() || '';

  if (
    radio.value.toLowerCase() === lowerValue ||
    label.includes(lowerValue) ||
    (lowerValue === '男' && (label.includes('男') || radio.value === '1')) ||
    (lowerValue === '女' && (label.includes('女') || radio.value === '2'))
  ) {
    radio.checked = true;
    triggerEvents(radio);
  }
}

// 填充复选框
function fillCheckbox(checkbox, value) {
  const lowerValue = value.toLowerCase();
  const shouldCheck = ['true', 'yes', '1', '是', '有', '已'].includes(lowerValue);
  if (checkbox.checked !== shouldCheck) {
    checkbox.checked = shouldCheck;
    triggerEvents(checkbox);
  }
}

// 触发 DOM 事件，让框架感知值变化
function triggerEvents(element) {
  const events = ['input', 'change', 'blur'];

  for (const eventType of events) {
    const event = new Event(eventType, {
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
  }

  // 额外触发 React 的合成事件
  const reactPropsKey = Object.keys(element).find(key =>
    key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
  );
  if (reactPropsKey) {
    // React 组件
    const reactProps = Object.keys(element).find(key =>
      key.startsWith('__reactProps$')
    );
    if (reactProps && element[reactProps]?.onChange) {
      element[reactProps].onChange({ target: element });
    }
  }
}

  // 暴露 API 到全局命名空间，供 content.js 使用
  window.ApplyRadarForms = window.ApplyRadarForms || {};
  Object.assign(window.ApplyRadarForms, {
    fillForm,
    fillDetectedFields,
    fillElement,
    getResumeValue,
  });
})();
