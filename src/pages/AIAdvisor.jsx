import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import HudPanel from '../components/HudPanel';

const SAMPLE_CONVERSATIONS = [
  {
    role: 'user',
    text: 'My corn field A-1 has NDVI dropping to 0.52 in the northwest corner while the rest averages 0.72. We\'ve only had 12mm rain in the last 2 weeks. What should I do?',
  },
  {
    role: 'assistant',
    text: `**Analysis: Localized Stress in Field A-1 -- Northwest Zone**

Based on the data you've provided, here's my assessment:

**Diagnosis**: The NDVI drop to 0.52 (vs. 0.72 field average) in the NW corner, combined with only 12mm rainfall over 14 days (vs. ~45mm seasonal normal), strongly suggests **moderate drought stress**. This 28% NDVI deficit is significant and warrants immediate attention.

**Immediate Actions**:
1. **Prioritize irrigation** to the NW zone -- this area needs water within 48-72 hours to prevent yield loss
2. **Scout the area in person** to confirm diagnosis -- check for wilting, leaf rolling, or other visual stress indicators
3. **Check soil moisture** at 6-12 inch depth if you have a probe available

**Context**: Your soil type (silt loam) has moderate water-holding capacity (~1.8 in/ft). At V8 corn growth stage, daily water use is approximately 0.25 in/day. The 2-week rainfall deficit creates roughly a 1.3-inch soil moisture shortfall.

**Forecast Factor**: Open-Meteo shows ~12mm rain expected Thursday. This will help but may not fully recover the deficit in the stressed zone.

**Caveats**: This analysis is based on satellite-derived indices at 10m resolution. Other causes for localized NDVI drops include nutrient deficiency, compaction, or pest damage. In-field scouting is essential to confirm water stress as the primary factor. Consult your local extension office for irrigation scheduling specific to your soil and crop stage.`,
  },
];

export default function AIAdvisor() {
  const [messages, setMessages] = useState(SAMPLE_CONVERSATIONS);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user', text: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg.text,
          history: messages.map((m) => ({ role: m.role, content: m.text })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, { role: 'assistant', text: data.response }]);
      } else {
        setMessages((prev) => [...prev, {
          role: 'assistant',
          text: '**Unable to reach AI backend.** Please ensure the Python backend is running and ANTHROPIC_API_KEY is configured in your .env file.',
        }]);
      }
    } catch {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        text: '**Connection error** -- the backend server may not be running. Start it with `cd backend && python main.py`.',
      }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fade-in">
      <div className="page-title">AI Agricultural Advisor</div>
      <p className="page-subtitle">
        AI-powered agronomist -- analyzes your field data and provides natural-language recommendations
      </p>

      <div className="grid-2-1">
        {/* Chat Area */}
        <HudPanel title="Advisor Console" className="flex flex-col">
          <div style={{
            height: 450, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12,
            padding: '4px 0',
          }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: 'flex', flexDirection: 'column',
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  fontSize: 10, color: 'var(--text-dim)', marginBottom: 3,
                  textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600,
                }}>
                  {msg.role === 'user' ? 'You' : 'AI Agronomist'}
                </div>
                <div style={{
                  maxWidth: '85%', padding: '10px 14px', borderRadius: 8,
                  fontSize: 13, lineHeight: 1.6,
                  background: msg.role === 'user'
                    ? 'rgba(61,122,74,0.06)'
                    : '#fafaf8',
                  border: `1px solid ${msg.role === 'user' ? 'rgba(61,122,74,0.15)' : '#e2e0dc'}`,
                  color: 'var(--text-primary)',
                }}>
                  {msg.role === 'assistant' ? (
                    <div className="md-content">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                  ) : (
                    msg.text
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="loading-spinner" />
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Analyzing field data...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div style={{
            display: 'flex', gap: 8, marginTop: 12, paddingTop: 12,
            borderTop: '1px solid var(--border-color)',
          }}>
            <textarea
              className="input-field"
              placeholder="Ask about your fields, crops, soil, weather, pests..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              style={{ minHeight: 42, resize: 'none', flex: 1 }}
            />
            <button
              className="btn btn-primary"
              onClick={handleSend}
              disabled={loading || !input.trim()}
              style={{ alignSelf: 'flex-end', padding: '10px 20px' }}
            >
              {loading ? '...' : 'Send'}
            </button>
          </div>
        </HudPanel>

        {/* Sidebar Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <HudPanel title="System Info">
            <div style={{ marginTop: 4 }}>
              {[
                ['Model', 'claude-sonnet-4-20250514'],
                ['Context', 'Field + Weather + Soil'],
                ['Source', 'Extension Docs'],
                ['Status', 'Ready'],
              ].map(([k, v]) => (
                <div key={k} style={{
                  display: 'flex', justifyContent: 'space-between', padding: '6px 0',
                  fontSize: 12, borderBottom: '1px solid #f0eeea',
                }}>
                  <span style={{ color: 'var(--text-dim)' }}>{k}</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
          </HudPanel>

          <HudPanel title="Quick Prompts">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                'Analyze my field NDVI trends and recommend actions',
                'What crops should I rotate into Field A-2 next season?',
                'Is it safe to spray fungicide this week given the forecast?',
                'Calculate growing degree days for my corn fields',
                'Summarize soil health across all my fields',
              ].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => setInput(prompt)}
                  style={{
                    background: '#fafaf8', border: '1px solid #e2e0dc',
                    borderRadius: 6, padding: '8px 10px', cursor: 'pointer',
                    fontSize: 11, color: 'var(--text-secondary)', textAlign: 'left',
                    fontFamily: 'inherit', transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.target.style.borderColor = 'var(--accent-primary)'; e.target.style.color = 'var(--text-primary)'; }}
                  onMouseLeave={(e) => { e.target.style.borderColor = '#e2e0dc'; e.target.style.color = 'var(--text-secondary)'; }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </HudPanel>
        </div>
      </div>
    </div>
  );
}
