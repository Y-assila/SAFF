import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll } from 'vitest'
import { initI18n } from '../i18n'

// jsdom does not implement the modal methods of <dialog>.
beforeAll(() => {
  const proto = HTMLDialogElement.prototype
  proto.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  proto.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

initI18n('en')

afterEach(() => {
  cleanup()
})
