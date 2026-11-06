// The contact form and the chat widget carry a hidden trap field: a request
// with it filled in is answered as sent and dropped (server/routes/submissions.js).
// If a browser's autofill or a password manager ever filled it for a real
// client, their message would vanish without a trace, so the trap must not
// look like anything those tools fill in.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const FORMS = ['views/ContactPage.vue', 'components/ChatWidget.vue']
// Words autofill and password managers match on (names, ids, labels).
const AUTOFILL = /web|site|url|http|home ?page|name|mail|phone|tel|mobile|address|street|city|zip|postal|country|company|organi[sz]ation|title|user|login|pass|card|birth/i

for (const file of FORMS) {
  test(`${file}: the hidden trap means nothing to autofill`, () => {
    const text = readFileSync(join(SRC, file), 'utf8')
    const input = text.match(/<input[^>]*v-model="form\.website"[^>]*>/)
    assert.ok(input, 'the trap input is bound to form.website')
    const attr = (n) => input[0].match(new RegExp(`\\s${n}="([^"]*)"`))?.[1]
    for (const n of ['id', 'name']) assert.doesNotMatch(attr(n) || '', AUTOFILL, `${n}="${attr(n)}"`)
    const label = text.match(new RegExp(`<label for="${attr('id')}">([^<]*)</label>`))
    assert.ok(label, 'the trap has its own label')
    assert.doesNotMatch(label[1], AUTOFILL, `label "${label[1]}"`)
    assert.equal(attr('autocomplete'), 'off')
    assert.equal(attr('tabindex'), '-1')
    assert.match(input[0], /data-1p-ignore/)
    assert.match(input[0], /data-lpignore="true"/)
    // Hidden from everyone: off-screen and out of the accessibility tree.
    const before = text.slice(0, input.index)
    const wrapper = before.slice(before.lastIndexOf('<div'))
    assert.match(wrapper, /aria-hidden="true"/)
    assert.match(wrapper, /left: -10000px/)
  })
}
