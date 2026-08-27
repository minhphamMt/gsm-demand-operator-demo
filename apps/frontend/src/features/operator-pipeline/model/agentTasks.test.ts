import { describe, expect, it } from 'vitest'

import { outsideTasks, tasksForAgent, type AgentTask } from '@/features/operator-pipeline/model/agentTasks'
import type { PipelineToolCall } from '@/features/operator-pipeline/model/pipelineRun'

const task = (id: string, owner: string): AgentTask => ({
  id,
  owner,
  label: id,
  command: `${id}()`,
  result: '',
  state: 'done',
})

const tasks = [task('forecast.run', 'forecast'), task('policy.check', 'dispatch'), task('approval.gate', 'outside')]

const toolCalls: readonly PipelineToolCall[] = [
  { agent: 'situation_assessment', tool: 'run_forecast', ok: true, detail: 'p50 sẵn sàng' },
  { agent: 'situation_assessment', tool: 'get_rain_nowcast', ok: true, detail: '' },
  { agent: 'situation_assessment', tool: 'summarise_context', ok: true, detail: '' },
  { agent: 'dispatch', tool: 'compute_relocation', ok: false, detail: '' },
]

describe('tasksForAgent', () => {
  it('lists the workflow steps an agent owns before its tool calls', () => {
    const forecast = tasksForAgent('forecast', tasks, toolCalls)

    expect(forecast.map((entry) => entry.label)).toEqual(['forecast.run', 'Tool: run_forecast'])
  })

  it('splits situation assessment tool calls across its three capability cards', () => {
    expect(tasksForAgent('traffic', tasks, toolCalls).map((entry) => entry.label)).toEqual(['Tool: get_rain_nowcast'])
    expect(tasksForAgent('supply', tasks, toolCalls)).toEqual([])
  })

  it('leaves an unclassifiable tool on the aggregate card instead of guessing', () => {
    expect(tasksForAgent('situation_assessment', tasks, toolCalls).map((entry) => entry.label))
      .toEqual(['Tool: summarise_context'])
  })

  it('flags a failed tool call for attention', () => {
    const [, failed] = tasksForAgent('dispatch', tasks, toolCalls)

    expect(failed?.state).toBe('attention')
    expect(failed?.result).toContain('rơi về đường deterministic')
  })
})

describe('outsideTasks', () => {
  it('collects the steps that no agent owns', () => {
    expect(outsideTasks(tasks).map((entry) => entry.id)).toEqual(['approval.gate'])
  })
})
