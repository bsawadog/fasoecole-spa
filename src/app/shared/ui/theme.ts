import { definePreset } from '@primeuix/themes';
import AuraBase from '@primeuix/themes/aura/base';
import Button from '@primeuix/themes/aura/button';
import InputText from '@primeuix/themes/aura/inputtext';
import Textarea from '@primeuix/themes/aura/textarea';
import Message from '@primeuix/themes/aura/message';
import DataTable from '@primeuix/themes/aura/datatable';
import Paginator from '@primeuix/themes/aura/paginator';
import Select from '@primeuix/themes/aura/select';
import Checkbox from '@primeuix/themes/aura/checkbox';
import InputNumber from '@primeuix/themes/aura/inputnumber';
import Tag from '@primeuix/themes/aura/tag';
import Skeleton from '@primeuix/themes/aura/skeleton';
import ProgressBar from '@primeuix/themes/aura/progressbar';
import DatePicker from '@primeuix/themes/aura/datepicker';

/** One palette and density for public pages and every school workspace. */
// Import only the themes of controls used by the application, keeping startup small.
export const schoolTheme = definePreset({
  ...AuraBase,
  components: {
    button: Button, inputtext: InputText, textarea: Textarea, message: Message,
    datatable: DataTable, paginator: Paginator, select: Select, checkbox: Checkbox,
    inputnumber: InputNumber, tag: Tag, skeleton: Skeleton, progressbar: ProgressBar, datepicker: DatePicker,
  },
}, {
  semantic: {
    primary: {
      50: '{emerald.50}', 100: '{emerald.100}', 200: '{emerald.200}',
      300: '{emerald.300}', 400: '{emerald.400}', 500: '{emerald.600}',
      600: '{emerald.700}', 700: '{emerald.800}', 800: '{emerald.900}',
      900: '{emerald.950}', 950: '#052e25',
    },
    formField: { borderRadius: '0.625rem', paddingX: '0.8rem', paddingY: '0.625rem' },
    focusRing: { width: '3px', style: 'solid', color: '{primary.200}', offset: '2px' },
    colorScheme: {
      light: {
        primary: { color: '{primary.600}', contrastColor: '#ffffff', hoverColor: '{primary.700}', activeColor: '{primary.800}' },
        surface: {
          0: '#ffffff', 50: '#f7faf9', 100: '#eef3f1', 200: '#dce5e1',
          300: '#bdcdc5', 400: '#8da69a', 500: '#647e71', 600: '#4c6258',
          700: '#35483f', 800: '#24392f', 900: '#162b22', 950: '#0c1b15',
        },
      },
    },
  },
  components: {
    button: { root: { borderRadius: '0.625rem', paddingX: '1rem', paddingY: '0.625rem', gap: '0.5rem', label: { fontWeight: '600' } } },
    datatable: {
      headerCell: { padding: '0.85rem 1rem' }, bodyCell: { padding: '0.85rem 1rem' },
      colorScheme: { light: { headerCell: { background: '{surface.50}', color: '{surface.600}' } } },
    },
  },
});
