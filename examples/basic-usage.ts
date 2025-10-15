/**
 * Basic usage example for Codex-Claude Wrapper
 */

// Example 1: Simple chat completion
async function simpleChat() {
  const response = await fetch('http://localhost:8001/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // 'Authorization': 'Bearer your-api-key', // If API key is enabled
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: 'What is 2 + 2?' }
      ]
    })
  });

  const data = await response.json();
  console.log('Response:', data.choices[0].message.content);
}

// Example 2: Session continuity
async function sessionChat() {
  const sessionId = 'my-session-' + Date.now();

  // First message
  const response1 = await fetch('http://localhost:8001/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: 'My name is Alice and I like Python' }
      ],
      session_id: sessionId
    })
  });

  const data1 = await response1.json();
  console.log('First response:', data1.choices[0].message.content);

  // Second message - should remember context
  const response2 = await fetch('http://localhost:8001/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: 'What is my name and what language do I like?' }
      ],
      session_id: sessionId
    })
  });

  const data2 = await response2.json();
  console.log('Second response:', data2.choices[0].message.content);
}

// Example 3: Streaming response
async function streamingChat() {
  const response = await fetch('http://localhost:8001/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: 'Count from 1 to 5' }
      ],
      stream: true
    })
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            console.log('\nStreaming complete');
            break;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content;
            if (content) {
              process.stdout.write(content);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
  }
}

// Example 4: List models
async function listModels() {
  const response = await fetch('http://localhost:8001/v1/models');
  const data = await response.json();

  console.log('Available models:');
  data.data.forEach((model: any) => {
    console.log(`  - ${model.id}`);
  });
}

// Example 5: Check health
async function healthCheck() {
  const response = await fetch('http://localhost:8001/health');
  const data = await response.json();
  console.log('Health status:', data);
}

// Example 6: Session management
async function sessionManagement() {
  // List sessions
  const listResponse = await fetch('http://localhost:8001/v1/sessions');
  const sessions = await listResponse.json();
  console.log('Active sessions:', sessions);

  // Get session details
  if (sessions.sessions.length > 0) {
    const sessionId = sessions.sessions[0].session_id;
    const detailResponse = await fetch(`http://localhost:8001/v1/sessions/${sessionId}`);
    const details = await detailResponse.json();
    console.log('Session details:', details);
  }
}

// Run examples
async function main() {
  console.log('=== Basic Chat ===');
  await simpleChat();

  console.log('\n=== Session Chat ===');
  await sessionChat();

  console.log('\n=== Streaming Chat ===');
  await streamingChat();

  console.log('\n=== List Models ===');
  await listModels();

  console.log('\n=== Health Check ===');
  await healthCheck();

  console.log('\n=== Session Management ===');
  await sessionManagement();
}

// Uncomment to run
// main().catch(console.error);

export { simpleChat, sessionChat, streamingChat, listModels, healthCheck, sessionManagement };
