import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Type } from 'typebox';
import { ModelRuntime, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { openSession } from '../../src/adapters/pi/session.js';

test('real Pi SDK: explicit route, tool call, events and cancellation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'perfect-pi-contract-'));
  const requests: Record<string, unknown>[] = [];
  let block = false;
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += String(chunk);
    const body = JSON.parse(raw) as Record<string, unknown>;
    requests.push(body);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    if (block) { res.write(': waiting\n\n'); return; }
    const messages = body.messages as Array<{role: string}>;
    const called = messages.some(m => m.role === 'tool');
    const delta = called
      ? { content: 'contract passed' }
      : { tool_calls: [{ index: 0, id: 'call_contract', type: 'function', function: { name: 'probe', arguments: '{"value":"ok"}' } }] };
    res.write(`data: ${JSON.stringify({id:'chatcmpl-contract', object:'chat.completion.chunk', model:'contract-model', choices:[{index:0, delta, finish_reason:null}]})}\n\n`);
    res.write(`data: ${JSON.stringify({id:'chatcmpl-contract', object:'chat.completion.chunk', model:'contract-model', choices:[{index:0, delta:{}, finish_reason: called ? 'stop' : 'tool_calls'}], usage:{prompt_tokens:20,completion_tokens:5,total_tokens:25}})}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  await writeFile(join(dir, 'models.json'), JSON.stringify({ providers: {
    'perfect-contract': { baseUrl:`http://127.0.0.1:${address.port}/v1`, api:'openai-completions', apiKey:'test-only', models:[{
      id:'contract-model', name:'Contract mock', reasoning:false, input:['text'],
      cost:{input:0,output:0,cacheRead:0,cacheWrite:0}, contextWindow:32000, maxTokens:1024,
    }] },
  }}));
  const runtime = await ModelRuntime.create({authPath:join(dir,'auth.json'), modelsPath:join(dir,'models.json'), allowModelNetwork:false});
  let tools = 0;
  const probe: ToolDefinition = {
    name:'probe', label:'Probe', description:'Call this tool once.',
    parameters:Type.Object({value:Type.String()}),
    execute:async () => { tools++; return {content:[{type:'text',text:'ok'}],details:{}}; },
  };
  const session = await openSession({cwd:dir,controlDir:join(dir,'control'),runtime,provider:'perfect-contract',model:'contract-model',reasoning:'off',systemPrompt:'Call probe then answer.',tools:[probe]});
  const events: string[] = [];
  session.subscribe(event => events.push(event.type));
  try {
    await session.prompt('Run the contract');
    assert.equal(tools,1);
    assert.ok(events.includes('tool_execution_end'));
    assert.ok(events.includes('agent_end'));
    assert.ok(requests.length >= 2);
    assert.ok(requests.every(r => r.model === 'contract-model'));
    block = true;
    const pending = session.prompt('Wait for cancellation');
    await new Promise(resolve => setTimeout(resolve,100));
    await session.abort();
    await pending;
    assert.equal(session.isStreaming,false);
  } finally {
    session.dispose(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(dir,{recursive:true,force:true});
  }
});
