import type { ResetTranslation } from '../types';

const enReset: ResetTranslation = {
  passwordReset: {
    forgot: {
      title: 'Forgot password',
      subtitle: 'Enter your user ID or verified contact e-mail and we will e-mail a link to set a new password.',
      checking: 'Checking whether e-mail can be sent…',
      label: 'User ID or e-mail',
      help: 'Only accounts with a verified contact e-mail get the mail.',
      required: 'Enter your user ID or e-mail.',
      submit: 'Send reset link',
      busy: 'Sending…',
      sent: 'Request received. If the account has a verified contact e-mail, a link valid for 30 minutes is on its way.',
      sentHint: 'No mail? Check your spam folder. Without a contact e-mail, please ask your administrator.',
      offTitle: 'Password reset by e-mail is not available right now.',
      offText: 'This server cannot send e-mail. Please ask your administrator, who can set a new password for you.',
      toLogin: 'Back to sign in',
    },

    reset: {
      title: 'Set a new password',
      subtitle: 'You came from the link in the e-mail. Enter a new password twice.',
      newPassword: 'New password',
      signOutAll: 'Changing it signs this account out on every device.',
      submit: 'Change password',
      busy: 'Changing…',
      done: 'Your password was changed. Sign in with the new one.',
      noToken: 'The link has no reset information. Open the link from the e-mail as it is, or request a new one.',
      again: 'Request a new link',
    },
  },
};

export default enReset;
