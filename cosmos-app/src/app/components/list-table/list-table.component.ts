import { Component, Input, Output, EventEmitter } from '@angular/core';
import { IHeaderList } from '../../interfaces/header-list.interface';
import { CommonModule } from '@angular/common';


@Component({
  selector: 'app-list-table',
  imports: [
    CommonModule
  ],
  templateUrl: './list-table.component.html',
  styleUrl: './list-table.component.scss'
})
export class ListTableComponent {
  @Input() headers!: IHeaderList[];
  @Input() data!: any[];
  @Output() optionsEvent = new EventEmitter<{ option: string, _id: string }>();
  @Input() total: number = 0;
  @Input() page: number = 1;
  @Input() limit: number = 10;
  @Output() pageChangeEvent = new EventEmitter<number>();


  toggleDetails(index: number) {
    this.data[index].isVisible = !this.data[index].isVisible;
  }

  trackByItemId(index: number, item: any): string {
    return item._id;
  }

  clickOptions(option: string, _id: string) {
    this.optionsEvent.emit({ option, _id });
  }

  pageChange(page: number) {
    this.pageChangeEvent.emit(page);
  }
}
