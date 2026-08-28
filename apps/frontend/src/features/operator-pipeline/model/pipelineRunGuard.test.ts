// Guard của bản ghi run sau khi gộp nhật ký — MA-6.7.
//
// Toàn bộ file này kiểm đúng một đánh đổi: **mất một dòng nhật ký thì tiếc, mất cả trạng thái
// run thì UI trắng.** Nên guard ở mức bản ghi nới tay, còn việc loại dòng hỏng để cho hook.

import { describe, expect, it } from 'vitest'

import { isPipelineRunRecord, isRunEvent } from '@/features/operator-pipeline/model/pipelineRunGuard'

const goodEvent = {
  seq: 1,
  at: '2026-08-28T17:02:01+07:00',
  kind: 'narration',
  actor: 'graph',
  text: 'một dòng',
  source: 'deterministic',
}

describe('isPipelineRunRecord với events', () => {
  it('chấp nhận bản ghi chưa có events — AI service bản cũ vẫn phải hiển thị được', () => {
    expect(isPipelineRunRecord({ run_id: 'r', status: 'RUNNING' })).toBe(true)
  })

  it('chấp nhận events rỗng', () => {
    expect(isPipelineRunRecord({ run_id: 'r', status: 'RUNNING', events: [] })).toBe(true)
  })

  it('một dòng hỏng KHÔNG kéo cả bản ghi run xuống', () => {
    const record = { run_id: 'r', status: 'DONE', events: [goodEvent, { seq: 2 }, null] }

    expect(isPipelineRunRecord(record)).toBe(true)
  })

  it('từ chối khi events không phải mảng — đó là payload sai hình, không phải dữ liệu thiếu', () => {
    expect(isPipelineRunRecord({ run_id: 'r', status: 'DONE', events: { seq: 1 } })).toBe(false)
  })
})

describe('isRunEvent', () => {
  it('nhận dòng đủ năm field dựng nên một dòng đọc được', () => {
    expect(isRunEvent(goodEvent)).toBe(true)
  })

  it('nhận kind lạ: backend thêm loại sự kiện trước khi client kịp cập nhật là chuyện bình thường', () => {
    expect(isRunEvent({ ...goodEvent, kind: 'awaiting_approval' })).toBe(true)
  })

  it('nhận dòng thiếu tool/ok/code — chúng chỉ là badge, không phải nội dung', () => {
    expect(isRunEvent(goodEvent)).toBe(true)
    expect(isRunEvent({ ...goodEvent, tool: null, ok: null, code: null })).toBe(true)
  })

  it.each([
    ['thiếu seq', { ...goodEvent, seq: undefined }],
    ['seq là chuỗi', { ...goodEvent, seq: '1' }],
    ['thiếu text', { ...goodEvent, text: undefined }],
    ['thiếu actor', { ...goodEvent, actor: undefined }],
    ['không phải object', 'một dòng'],
  ])('loại dòng %s', (_name, value) => {
    expect(isRunEvent(value)).toBe(false)
  })
})
