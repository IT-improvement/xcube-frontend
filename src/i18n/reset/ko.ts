// Password reset pages (UR-63 F6): loaded with /forgot-password and /reset-password, not with main.
const koReset = {
  passwordReset: {
    forgot: {
      title: '비밀번호 찾기',
      subtitle: '아이디나 인증한 연락 이메일을 넣으면 비밀번호를 새로 정하는 링크를 메일로 보냅니다.',
      checking: '메일을 보낼 수 있는지 확인하는 중…',
      label: '아이디 또는 이메일',
      help: '연락 이메일을 인증한 계정만 메일을 받습니다.',
      required: '아이디 또는 이메일을 입력하세요.',
      submit: '재설정 링크 보내기',
      busy: '보내는 중…',
      sent: '요청을 받았습니다. 인증된 연락 이메일이 있으면 30분 동안 쓸 수 있는 링크가 곧 도착합니다.',
      sentHint: '메일이 오지 않으면 스팸함을 확인하세요. 연락 이메일을 등록하지 않았다면 관리자에게 문의하세요.',
      offTitle: '지금은 메일로 비밀번호를 찾을 수 없습니다.',
      offText: '이 서버는 메일을 보낼 수 없습니다. 관리자에게 문의하세요. 관리자가 비밀번호를 새로 정해 줄 수 있습니다.',
      toLogin: '로그인으로 돌아가기',
    },

    reset: {
      title: '새 비밀번호 정하기',
      subtitle: '메일의 링크로 들어왔습니다. 새 비밀번호를 두 번 입력하세요.',
      newPassword: '새 비밀번호',
      signOutAll: '바꾸면 이 계정의 모든 기기에서 로그아웃됩니다.',
      submit: '비밀번호 바꾸기',
      busy: '바꾸는 중…',
      done: '비밀번호를 바꿨습니다. 새 비밀번호로 로그인하세요.',
      noToken: '링크에 재설정 정보가 없습니다. 메일의 링크를 그대로 열거나 새 링크를 요청하세요.',
      again: '새 링크 요청하기',
    },
  },
};

export default koReset;
