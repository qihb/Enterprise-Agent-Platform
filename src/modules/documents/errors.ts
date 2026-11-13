export const errors = {
  not_configured: [503, "本地保存尚未配置，请先配置专用数据库和文件加密密钥。"],
  forbidden: [403, "仅允许本机同源访问。"],
  invalid_pdf: [400, "请选择有效的 PDF 文件。"],
  too_large: [413, "单个 PDF 不能超过 10 MB。"],
  not_found: [404, "资料不存在或已不可访问。"],
  storage_failed: [503, "文件保存或读取失败，请稍后重试。"],
  database_failed: [503, "数据库暂不可用，资料操作未完成。"],
  save_uncertain: [503, "保存结果尚未确认，请刷新资料列表后再重试。"],
} as const;

export class DocumentError extends Error {
  readonly code: keyof typeof errors;
  constructor(code: keyof typeof errors) {
    super(errors[code][1]);
    this.name = "DocumentError";
    this.code = code;
  }
}

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const LOCAL_OWNER = "local-demo";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
