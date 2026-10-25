// "Ask Agent" panel. The agent runs on the AI provider configured in Settings → AI
// Provider, straight from this page; it is unavailable until one is set up. It works on
// a copy of the current buffer; its result is shown as a diff and only applied when the
// user accepts it.
import * as llm from '../shared/llm.js';
import { renderDiff, diffStats } from './diffview.js';
import { t } from '../shared/i18n.js';

export class AgentPanel {
  constructor({ el, getDoc, onApply, openSettings, toast }) {
    this.el = el;
    this.getDoc = getDoc;
    this.onApply = onApply;
    this.openSettings = openSettings;
    this.toast = toast;
    this.prompt = el.querySelector('#agent-prompt');
    this.log = el.querySelector('#agent-log');
    this.runBtn = el.querySelector('[data-act="agent-run"]');
    this.stopBtn = el.querySelector('[data-act="agent-stop"]');
    this.status = el.querySelector('#agent-status');
    this.result = el.querySelector('#agent-result');

    this.runBtn.addEventListener('click', () => this.run());
    this.stopBtn.addEventListener('click', () => this.stop());
    this.prompt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); this.run(); }
    });
    el.querySelector('[data-act="agent-copy"]').addEventListener('click', async () => {
      await navigator.clipboard.writeText(this.fullPrompt());
      this.toast('Prompt copied — paste it into any AI assistant');
    });
  }

  refresh() {
    const box = this.el.querySelector('#agent-host');
    const dest = this.el.querySelector('#agent-dest');
    const p = llm.getProvider();
    if (!llm.providerReady(p)) {
      box.hidden = false;
      box.innerHTML = `<b>${t('No AI provider configured.')}</b> ${t('The built-in agent sends the document to an AI provider you choose. Add one with its API format (OpenAI or Anthropic), base URL, model and API key.')}<br><button class="btn small" data-act="agent-config">${t('Configure AI provider')}</button>`;
      box.querySelector('[data-act="agent-config"]').onclick = () => this.openSettings('ai');
      dest.hidden = true;
      this.runBtn.disabled = true;
      return;
    }
    box.hidden = true;
    dest.hidden = false;
    dest.textContent = t('Sends this document to {host} · {model}', { host: llm.providerHost(p), model: p.model });
    this.runBtn.disabled = !!this.abort;
  }

  setPrompt(text) {
    this.prompt.value = text;
    this.prompt.focus();
  }

  fullPrompt() {
    const doc = this.getDoc();
    return `${this.prompt.value.trim()}\n\n(The document is \`${doc.path}\`.)`;
  }

  appendLog(text, cls = '') {
    const line = document.createElement('div');
    line.className = 'log-line ' + cls;
    line.textContent = text;
    this.log.append(line);
    this.log.scrollTop = this.log.scrollHeight;
  }

  async run() {
    const task = this.prompt.value.trim();
    if (!task || this.abort) return;
    const provider = llm.getProvider();
    if (!llm.providerReady(provider)) return this.refresh();
    const doc = this.getDoc();
    const original = doc.text;
    const { system, user, tag } = llm.editPrompt({ text: original, name: doc.name, task });
    this.log.innerHTML = '';
    this.result.hidden = true;
    this.el.classList.add('running');
    this.runBtn.disabled = true;
    this.stopBtn.hidden = false;
    this.abort = new AbortController();
    let received = 0;
    this.status.textContent = t('Waiting for {host}…', { host: llm.providerHost(provider) });
    this.appendLog(`→ ${llm.providerHost(provider)} · ${provider.model}`, 'dim');
    try {
      const res = await llm.complete({
        system,
        user,
        signal: this.abort.signal,
        onText: (d) => { received += d.length; this.status.textContent = t('Receiving… {n} characters', { n: received.toLocaleString() }); },
      });
      if (res.stopped === 'refusal') throw new Error(t('The model declined this request.'));
      if (res.stopped === 'length') throw new Error(t('The reply was cut off before the document was complete, so nothing was changed. Try a smaller document or a model with a larger output limit.'));
      const edit = llm.parseEdit(res.text, tag, original);
      if (!edit) throw new Error(t('The reply did not contain a revised document, so nothing was changed.'));
      this.status.textContent = t('Finished');
      if (edit.summary) this.appendLog(edit.summary);
      this.showResult(original, edit.doc);
    } catch (e) {
      this.status.textContent = e.message === 'Stopped' ? t('Stopped') : t('Failed');
      if (e.message !== 'Stopped') this.appendLog(e.message, 'stderr');
    } finally {
      this.abort = null;
      this.el.classList.remove('running');
      this.runBtn.disabled = false;
      this.stopBtn.hidden = true;
    }
  }

  stop() {
    this.abort?.abort();
  }

  showResult(original, next) {
    this.result.hidden = false;
    if (next === original || next == null) {
      this.result.innerHTML = '<div class="empty-hint">The agent made no changes to the document.</div>';
      return;
    }
    const { added, removed } = diffStats(original, next);
    this.result.innerHTML = `<div class="result-head"><b>Proposed changes</b> <span class="stat add">+${added}</span> <span class="stat del">−${removed}</span>
      <span class="spacer"></span><button class="btn small" data-act="discard">Discard</button><button class="btn small" data-act="apply">Apply</button><button class="btn small primary" data-act="apply-save">Apply &amp; Save</button></div>
      <div class="diff">${renderDiff(original, next)}</div>`;
    this.result.querySelector('[data-act="discard"]').onclick = () => { this.result.hidden = true; };
    this.result.querySelector('[data-act="apply"]').onclick = () => { this.onApply(next, false); this.result.hidden = true; };
    this.result.querySelector('[data-act="apply-save"]').onclick = () => { this.onApply(next, true); this.result.hidden = true; };
  }
}
