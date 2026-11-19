import type { Translation } from './en'

// NOTE: needs review by a native French copywriter before launch.
const fr: Translation = {
  common: {
    appName: 'SAFF',
    taglineLead: 'Votre tour.',
    taglineTail: 'À votre rythme.',
    loading: 'Chargement…',
    retry: 'Réessayer',
    close: 'Fermer',
    backHome: 'Retour à l’accueil',
    skipToContent: 'Aller au contenu',
    homeLink: 'SAFF — accueil',
  },
  nav: {
    primary: 'Navigation principale',
    home: 'Accueil',
    howItWorks: 'Comment ça marche',
    forShops: 'Pour les salons',
    barberSignIn: 'Espace barbier',
    openMenu: 'Ouvrir le menu',
    closeMenu: 'Fermer le menu',
  },
  language: {
    label: 'Langue',
  },
  landing: {
    title: 'File d’attente numérique pour salons de coiffure',
    heroLead: 'Votre tour.',
    heroTail: 'À votre rythme.',
    heroBody:
      'Scannez le QR code du salon, rejoignez la file en quelques secondes et suivez votre place où que vous soyez. Sans application, sans compte.',
    ctaHow: 'Voir comment ça marche',
    ctaShops: 'Pour les salons',
    how: {
      title: 'Comment ça marche',
      intro: 'Quatre étapes, de la porte du salon jusqu’au fauteuil.',
      steps: {
        scan: {
          title: 'Scannez le QR code du salon',
          body: 'Chaque salon dispose de son propre QR code permanent à l’entrée.',
        },
        details: {
          title: 'Indiquez votre nom et votre téléphone',
          body: 'Ni mot de passe ni compte. Les messages WhatsApp uniquement avec votre accord.',
        },
        ticket: {
          title: 'Recevez votre ticket numérique',
          body: 'Vous obtenez un numéro de ticket et un lien privé vers votre place dans la file.',
        },
        track: {
          title: 'Suivez votre tour à distance',
          body: 'Voyez combien de personnes sont devant vous et revenez au bon moment.',
        },
      },
    },
    shops: {
      title: 'Pensé pour les barbiers',
      body: 'Un tableau de bord simple pour gérer la file du jour, dans l’ordre d’arrivée.',
      points: {
        fair: {
          title: 'Équitable par principe',
          body: 'Les clients sont servis dans l’ordre d’inscription. Les numéros de ticket sont attribués par le système.',
        },
        control: {
          title: 'Un parcours clair',
          body: 'Appelez le client suivant, commencez puis terminez la prestation, chaque fois en une seule action.',
        },
        calm: {
          title: 'Un salon plus serein',
          body: 'Moins de monde qui attend à l’intérieur, et des clients qui arrivent quand leur tour approche.',
        },
      },
      access: 'Les comptes des salons sont créés par l’équipe SAFF.',
    },
    privacy: {
      title: 'Confidentiel par défaut',
      body: 'Votre numéro de téléphone n’est jamais affiché publiquement et le lien de votre ticket vous est réservé.',
    },
  },
  placeholder: {
    badge: 'Bientôt disponible',
    shop: {
      title: 'Rejoindre la file',
      body: 'L’inscription dans la file d’un salon n’est pas encore disponible. Cette partie de SAFF est en cours de construction.',
    },
    ticket: {
      title: 'Votre ticket',
      body: 'Le suivi du ticket n’est pas encore disponible. Cette partie de SAFF est en cours de construction.',
    },
    barberSignIn: {
      title: 'Espace barbier',
      body: 'Les comptes barbiers ne sont pas encore disponibles. Cette partie de SAFF est en cours de construction.',
    },
    dashboard: {
      title: 'Tableau de bord de la file',
      body: 'Le tableau de bord barbier n’est pas encore disponible. Cette partie de SAFF est en cours de construction.',
    },
  },
  notFound: {
    title: 'Page introuvable',
    body: 'La page que vous cherchez n’existe pas ou a été déplacée.',
  },
  states: {
    emptyTitle: 'Rien pour le moment',
    errorTitle: 'Une erreur est survenue',
    errorBody: 'Veuillez réessayer dans un instant.',
  },
  footer: {
    rights: '© {{year}} SAFF. Tous droits réservés.',
  },
}

export default fr
