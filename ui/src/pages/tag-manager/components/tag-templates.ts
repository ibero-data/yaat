export interface TagConfigField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select'
  placeholder?: string
  required?: boolean
  options?: { label: string; value: string }[]
}

export interface TagTemplate {
  type: string
  name: string
  description: string
  icon: string
  configFields: TagConfigField[]
}

export const TAG_TEMPLATES: TagTemplate[] = [
  {
    type: 'custom_html',
    name: 'Custom HTML',
    description: 'Inject custom HTML/JavaScript',
    icon: 'Code',
    configFields: [
      { key: 'html', label: 'HTML Code', type: 'textarea', required: true, placeholder: '<script>...</script>' },
    ],
  },
  {
    type: 'ga4',
    name: 'Google Analytics 4',
    description: 'Google Analytics measurement',
    icon: 'BarChart',
    configFields: [
      { key: 'measurement_id', label: 'Measurement ID', type: 'text', required: true, placeholder: 'G-XXXXXXXXXX' },
    ],
  },
  {
    type: 'meta_pixel',
    name: 'Meta Pixel',
    description: 'Facebook/Meta tracking pixel',
    icon: 'Facebook',
    configFields: [
      { key: 'pixel_id', label: 'Pixel ID', type: 'text', required: true, placeholder: '123456789' },
    ],
  },
  {
    type: 'google_ads',
    name: 'Google Ads',
    description: 'Google Ads conversion tracking',
    icon: 'Target',
    configFields: [
      { key: 'conversion_id', label: 'Conversion ID', type: 'text', required: true, placeholder: 'AW-XXXXXXXXX' },
      { key: 'conversion_label', label: 'Conversion Label', type: 'text', placeholder: 'optional' },
    ],
  },
  {
    type: 'linkedin',
    name: 'LinkedIn Insight',
    description: 'LinkedIn conversion tracking',
    icon: 'Linkedin',
    configFields: [
      { key: 'partner_id', label: 'Partner ID', type: 'text', required: true },
    ],
  },
  {
    type: 'tiktok',
    name: 'TikTok Pixel',
    description: 'TikTok tracking pixel',
    icon: 'Music',
    configFields: [
      { key: 'pixel_id', label: 'Pixel ID', type: 'text', required: true },
    ],
  },
]

export function getTemplate(type: string): TagTemplate | undefined {
  return TAG_TEMPLATES.find((t) => t.type === type)
}

export const TRIGGER_TYPE_LABELS: Record<string, string> = {
  page_load: 'Page Load',
  dom_ready: 'DOM Ready',
  click_all: 'All Clicks',
  click_specific: 'Specific Click',
  scroll_depth: 'Scroll Depth',
  custom_event: 'Custom Event',
  timer: 'Timer',
  history_change: 'History Change',
  form_submit: 'Form Submit',
}

export const VARIABLE_TYPE_LABELS: Record<string, string> = {
  data_layer: 'Data Layer',
  url_param: 'URL Parameter',
  cookie: 'Cookie',
  dom_element: 'DOM Element',
  js_variable: 'JavaScript Variable',
  constant: 'Constant',
  referrer: 'Referrer',
  page_url: 'Page URL',
  page_path: 'Page Path',
  page_hostname: 'Page Hostname',
}

export const CONSENT_CATEGORIES = [
  { label: 'Necessary', value: 'necessary' },
  { label: 'Analytics', value: 'analytics' },
  { label: 'Marketing', value: 'marketing' },
  { label: 'Preferences', value: 'preferences' },
]

export interface TriggerConfigField {
  key: string
  label: string
  type: 'text' | 'number'
  placeholder?: string
  required?: boolean
}

export const TRIGGER_CONFIG_FIELDS: Record<string, TriggerConfigField[]> = {
  custom_event: [
    { key: 'event_name', label: 'Event Name', type: 'text', required: true, placeholder: 'e.g., purchase' },
  ],
  scroll_depth: [
    { key: 'percentage', label: 'Scroll Percentage', type: 'number', required: true, placeholder: '50' },
  ],
  timer: [
    { key: 'interval_ms', label: 'Interval (ms)', type: 'number', required: true, placeholder: '5000' },
    { key: 'limit', label: 'Max Fires', type: 'number', placeholder: '1' },
  ],
  click_specific: [
    { key: 'selector', label: 'CSS Selector', type: 'text', required: true, placeholder: '#buy-btn, .cta' },
  ],
  form_submit: [
    { key: 'selector', label: 'Form Selector (optional)', type: 'text', placeholder: 'form#checkout' },
  ],
}

export interface VariableConfigField {
  key: string
  label: string
  type: 'text'
  placeholder?: string
  required?: boolean
}

export const VARIABLE_CONFIG_FIELDS: Record<string, VariableConfigField[]> = {
  data_layer: [
    { key: 'variable_name', label: 'Variable Name', type: 'text', required: true, placeholder: 'ecommerce.purchase.revenue' },
  ],
  url_param: [
    { key: 'param_name', label: 'Parameter Name', type: 'text', required: true, placeholder: 'utm_source' },
  ],
  cookie: [
    { key: 'cookie_name', label: 'Cookie Name', type: 'text', required: true, placeholder: '_ga' },
  ],
  dom_element: [
    { key: 'selector', label: 'CSS Selector', type: 'text', required: true, placeholder: '#price' },
    { key: 'attribute', label: 'Attribute (optional)', type: 'text', placeholder: 'data-value' },
  ],
  js_variable: [
    { key: 'variable_name', label: 'Global Variable', type: 'text', required: true, placeholder: 'window.userId' },
  ],
  constant: [
    { key: 'value', label: 'Value', type: 'text', required: true, placeholder: 'my-constant-value' },
  ],
}
