import { getCompanyInitial, getActiveWaitingDays } from '../../utils/format';
import { SOURCE_LABELS } from '../../utils/constants';

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
    sourceLabel: '',
  },

  observers: {
    application(app: any) {
      if (app) {
        this.setData({
          initial: getCompanyInitial(app.company_name || ''),
          waitingDays: getActiveWaitingDays(app),
          sourceLabel: SOURCE_LABELS[app.source as keyof typeof SOURCE_LABELS] || '',
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
