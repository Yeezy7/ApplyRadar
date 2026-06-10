import { STATUS_LABELS } from '../../utils/constants';
import type { ApplicationStatus } from '../../utils/types';

Component({
  properties: {
    status: {
      type: String,
      value: 'unknown',
    },
  },

  data: {
    label: '未知',
  },

  observers: {
    status(val: ApplicationStatus) {
      this.setData({
        label: STATUS_LABELS[val] || val,
      });
    },
  },
});
