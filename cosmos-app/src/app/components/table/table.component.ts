import { Component, Input, Output, EventEmitter } from '@angular/core';
import { IHeaderList } from '../../interfaces/header-list.interface';
import { ShortTextPipe } from '../../pipes/short-text.pipe';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-table',
  imports: [ShortTextPipe, CommonModule],
  templateUrl: './table.component.html',
  styleUrl: './table.component.scss',
})
export class TableComponent {
  @Input() headers: IHeaderList[] = [];
  @Input() data: any[] = [];
  @Output() optionsEvent = new EventEmitter<{ option: string; _id: string }>();
  @Input() reorderable: boolean = true;
  private draggedRow: any;
  private draggedRowNext: any;

  options(option: string, _id: string) {
    this.optionsEvent.emit({ option, _id });
  }

  trackByItemId(index: number, item: any): string {
    return item._id;
  }

  onDragStart(event: DragEvent, row: any) {
    this.draggedRow = row;
    event.dataTransfer!.effectAllowed = 'move';
    event.dataTransfer!.setData('text/plain', JSON.stringify(row));
    (event.target as HTMLElement).classList.add('dragging');
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    const targetRow = (event.target as HTMLElement).closest('tr');
    if (targetRow) {
      targetRow.classList.add('drag-over');
    }
  }

  onDragLeave(event: DragEvent) {
    const targetRow = (event.target as HTMLElement).closest('tr');
    if (targetRow) {
      targetRow.classList.remove('drag-over');
    }
  }

  onDrop(targetRowData: any) {
    this.draggedRowNext = targetRowData;
  }

  onDragEnd(event: DragEvent) {
    (event.target as HTMLElement).classList.remove('dragging');
    this.reorder();
  }

  reorder() {
    this.data.find((row) => row._id === this.draggedRowNext._id).order =
      this.draggedRow.order;
    this.data.find((row) => row._id === this.draggedRow._id).order =
      this.draggedRowNext.order;
    this.data = [...this.data.sort((a, b) => a.order - b.order)];
  }
}
