import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ListTableComponent } from '../list-table/list-table.component';
import { IHeaderList } from '../../interfaces/header-list.interface';

@Component({
  selector: 'app-data',
  imports: [ListTableComponent],
  templateUrl: './data.component.html',
  styleUrl: './data.component.scss',
})
export class DataComponent {
  @Input() headers: IHeaderList[] = [];
  @Input() data: any[] = [];
  @Output() optionsEvent = new EventEmitter<{ option: string, _id: string }>();
  @Input() total: number = 0;
  @Input() page: number = 1;
  @Input() limit: number = 10;
  @Output() pageChangeEvent = new EventEmitter<number>();

  clickOptions(option: string, _id: string) {
    this.optionsEvent.emit({ option, _id });
  }

  pageChange(page: number) {
    this.pageChangeEvent.emit(page);
  }
}