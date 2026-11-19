/**
 * English strings. This file defines the translation shape;
 * `fr.ts` and `ar.ts` are type-checked against it so a missing key fails `tsc`.
 */
const en = {
  common: {
    appName: 'SAFF',
    taglineLead: 'Your turn.',
    taglineTail: 'On your time.',
    loading: 'Loading…',
    retry: 'Try again',
    close: 'Close',
    backHome: 'Back to home',
    skipToContent: 'Skip to content',
    homeLink: 'SAFF — home',
  },
  nav: {
    primary: 'Main navigation',
    home: 'Home',
    howItWorks: 'How it works',
    forShops: 'For barbershops',
    barberSignIn: 'Barber sign in',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
  },
  language: {
    label: 'Language',
  },
  landing: {
    title: 'Digital queue for barbershops',
    heroLead: 'Your turn.',
    heroTail: 'On your time.',
    heroBody:
      'Scan the shop’s QR code, join the queue in seconds and follow your place from anywhere. No app, no account.',
    ctaHow: 'See how it works',
    ctaShops: 'For barbershops',
    how: {
      title: 'How it works',
      intro: 'Four steps, from the shop door to the chair.',
      steps: {
        scan: {
          title: 'Scan the shop QR code',
          body: 'Every shop has its own permanent QR code at the entrance.',
        },
        details: {
          title: 'Enter your name and phone',
          body: 'No password and no account. WhatsApp updates only if you agree.',
        },
        ticket: {
          title: 'Get your digital ticket',
          body: 'You receive a ticket number and a private link to your place in line.',
        },
        track: {
          title: 'Track your turn remotely',
          body: 'See how many people are ahead of you and come back when it is time.',
        },
      },
    },
    shops: {
      title: 'Built for barbers',
      body: 'A focused dashboard to run the day’s queue, first come, first served.',
      points: {
        fair: {
          title: 'Fair by design',
          body: 'Customers are served in the order they joined. Ticket numbers are assigned by the system.',
        },
        control: {
          title: 'One clear flow',
          body: 'Call the next customer, start the service and complete it, each with a single action.',
        },
        calm: {
          title: 'A calmer shop',
          body: 'Fewer people waiting inside, and customers who arrive when their turn is near.',
        },
      },
      access: 'Shop accounts are set up by the SAFF team.',
    },
    privacy: {
      title: 'Private by default',
      body: 'Your phone number is never shown publicly, and your ticket link is private to you.',
    },
  },
  placeholder: {
    badge: 'Coming soon',
    shop: {
      title: 'Join the queue',
      body: 'Joining a shop queue is not available yet. This part of SAFF is under construction.',
    },
    ticket: {
      title: 'Your ticket',
      body: 'Ticket tracking is not available yet. This part of SAFF is under construction.',
    },
    barberSignIn: {
      title: 'Barber sign in',
      body: 'Barber accounts are not available yet. This part of SAFF is under construction.',
    },
    dashboard: {
      title: 'Queue dashboard',
      body: 'The barber dashboard is not available yet. This part of SAFF is under construction.',
    },
  },
  notFound: {
    title: 'Page not found',
    body: 'The page you are looking for does not exist or has moved.',
  },
  states: {
    emptyTitle: 'Nothing here yet',
    errorTitle: 'Something went wrong',
    errorBody: 'Please try again in a moment.',
  },
  footer: {
    rights: '© {{year}} SAFF. All rights reserved.',
  },
}

export default en
export type Translation = typeof en
