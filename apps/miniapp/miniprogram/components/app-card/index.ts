import { getCompanyInitial, getActiveWaitingDays } from '../../utils/format';

Component({
  properties: {
    application: {
      type: Object,
      value: {},
    },
  },

  data: {
    initial: '',
    waitingDays: null as number | null,
  },

  observers: {
    application(app: any) {
      if (app) {
        this.setData({
          initial: getCompanyInitial(app.company_name || ''),
          waitingDays: getActiveWaitingDays(app),
        });
      }
    },
  },

  methods: {
    onTap() {
      this.triggerEvent('tap', { id: this.data.application._id });
    },
  },
});
