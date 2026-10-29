// Tree-shaken FontAwesome registry for the staff portal. Same mechanism as
// site/src/icons.js: dom.watch() swaps <i class="fa-solid fa-foo"> for the
// registered SVG. An icon used in a template but missing here renders as an
// empty placeholder, so test/icons.test.js fails when a template references an
// unregistered icon.
import { library, dom } from '@fortawesome/fontawesome-svg-core'

import {
  faArchive,
  faArrowsRotate,
  faCircleInfo,
  faCirclePause,
  faComments,
  faFlask,
  faLock,
  faRotateLeft,
  faUser,
  faArrowLeft,
  faArrowRightFromBracket,
  faBell,
  faBellSlash,
  faBriefcase,
  faCheck,
  faCheckCircle,
  faChevronDown,
  faChevronRight,
  faChevronUp,
  faCircleExclamation,
  faCommentDots,
  faDownload,
  faEnvelope,
  faEnvelopeOpen,
  faExclamationCircle,
  faExclamationTriangle,
  faFileArrowUp,
  faFileInvoiceDollar,
  faLink,
  faInbox,
  faKey,
  faLocationDot,
  faMagnifyingGlass,
  faNoteSticky,
  faPaperPlane,
  faPhone,
  faRotateRight,
  faSpinner,
  faTrash,
  faTriangleExclamation,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'

export const ICONS = [
  faArchive, faArrowLeft, faArrowRightFromBracket, faBell, faBellSlash, faBriefcase,
  faCheck, faCheckCircle, faChevronDown, faChevronRight, faChevronUp, faCircleExclamation, faCommentDots,
  faDownload, faEnvelope, faEnvelopeOpen, faExclamationCircle, faExclamationTriangle, faFileArrowUp, faFileInvoiceDollar, faLink,
  faInbox, faKey, faLocationDot, faMagnifyingGlass, faNoteSticky, faPaperPlane, faPhone,
  faRotateRight, faSpinner, faTrash, faTriangleExclamation, faXmark,
  faArrowsRotate, faCircleInfo, faCirclePause, faComments, faFlask, faLock, faRotateLeft, faUser,
]

library.add(...ICONS)


export function startFontAwesome() {
  dom.i2svg()
  dom.watch()
}
