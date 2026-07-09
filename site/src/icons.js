// Tree-shaken FontAwesome icon registry.
//
// Importing the full fontawesome-free CSS pulled in 240KB of webfonts + 80KB
// of icon-class CSS even though we use ~53 icons. By switching to the SVG
// core + per-icon imports, only these icons get bundled.
//
// dom.watch() observes the live DOM and replaces any <i class="fa-solid
// fa-foo"> with the matching SVG from the registered library — so existing
// templates work unchanged.
//
// To add an icon: import it below, then register it with library.add(). If
// you forget, the <i> stays as an empty placeholder (not an error).
import { library, dom } from '@fortawesome/fontawesome-svg-core'

import {
  faArchive,
  faArrowLeft,
  faArrowRight,
  faArrowRightFromBracket,
  faAt,
  faBriefcase,
  faCheckCircle,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faChildren,
  faChurch,
  faCircleExclamation,
  faCirclePlay,
  faClock,
  faCommentDots,
  faCreditCard,
  faDownload,
  faEarthAmericas,
  faEnvelope,
  faEnvelopeOpen,
  faExclamationCircle,
  faExclamationTriangle,
  faFileSignature,
  faFlagUsa,
  faGavel,
  faGlobe,
  faGraduationCap,
  faHelmetSafety,
  faIdCard,
  faInbox,
  faKey,
  faLink,
  faLocationDot,
  faMapMarkerAlt,
  faMessage,
  faPaperPlane,
  faPeopleRoof,
  faPhone,
  faPlay,
  faRotateRight,
  faScaleBalanced,
  faShieldHalved,
  faSpinner,
  faStar,
  faTractor,
  faUmbrella,
  faUser,
  faVolumeXmark,
  faVideo,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'

import {
  faFacebookF,
  faInstagram,
  faTiktok,
  faWhatsapp,
  faYoutube,
} from '@fortawesome/free-brands-svg-icons'

library.add(
  // solid
  faArchive, faArrowLeft, faArrowRight, faArrowRightFromBracket, faAt,
  faBriefcase, faCheckCircle, faChevronDown, faChevronLeft, faChevronRight, faChildren,
  faChurch, faCircleExclamation, faCirclePlay, faClock, faCommentDots,
  faCreditCard, faDownload, faEarthAmericas, faEnvelope, faEnvelopeOpen,
  faExclamationCircle, faExclamationTriangle, faFileSignature,
  faFlagUsa, faGavel, faGlobe, faGraduationCap, faHelmetSafety,
  faIdCard, faInbox, faKey, faLink, faLocationDot, faMapMarkerAlt,
  faMessage, faPaperPlane, faPeopleRoof, faPhone, faPlay,
  faRotateRight, faScaleBalanced, faShieldHalved, faSpinner, faStar, faTractor, faUmbrella,
  faUser, faVideo, faVolumeXmark, faXmark,
  // brands
  faFacebookF, faInstagram, faTiktok, faWhatsapp, faYoutube,
)

// Replace any existing <i class="fa-..."> in the DOM with the SVG icon, AND
// watch for future ones added by Vue. Without this, <i> tags stay as empty
// elements since the webfont CSS is no longer loaded.
export function startFontAwesome() {
  // i2svg processes any <i> tags already in the DOM; watch sets up a
  // MutationObserver so newly-added ones (Vue re-renders, modals, etc.)
  // also get replaced.
  dom.i2svg()
  dom.watch()
  if (import.meta.env.DEV) {
    console.log('[FA] dom.watch + i2svg started, library has', library.definitions ? Object.keys(library.definitions).length : 0, 'prefixes')
  }
}
