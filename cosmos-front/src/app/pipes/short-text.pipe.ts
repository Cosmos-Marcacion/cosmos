import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'shortText'
})
export class ShortTextPipe implements PipeTransform {

  transform(value: string, length: number = 20): string {
    if (typeof value === 'string') {
      if (value?.length <= length) {
        return value
      }
      return value && value?.length > length ? value?.slice(0, length) + '...' : ''
    } else {
      return value
    }
  }

}
