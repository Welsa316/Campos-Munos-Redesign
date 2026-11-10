// Renders the small inline syntax the blog articles use, without v-html:
//   [link text](/path)  → <router-link> (internal paths only)
//   **bold**            → <strong>
// Anything else is plain text, so article strings can never inject markup.
import { h, defineComponent } from 'vue'
import { RouterLink } from 'vue-router'
import { parseInline } from '../utils/inlineMarkup.js'

export default defineComponent({
  name: 'RichText',
  props: { text: { type: String, required: true } },
  setup(props) {
    return () => parseInline(props.text).map((part) => {
      if (part.type === 'link') {
        return h(RouterLink, { to: part.to, class: 'rich-link' }, () => part.text)
      }
      if (part.type === 'bold') return h('strong', { class: 'font-semibold text-gray-800' }, part.text)
      return part.text
    })
  },
})
