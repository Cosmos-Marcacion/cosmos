import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SplashService } from '../../services/splash.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-splash',
  imports: [CommonModule],
  templateUrl: './splash.component.html',
  styleUrl: './splash.component.scss',
})
export class SplashComponent implements OnInit {
  private splashService = inject(SplashService);
  showSplash!: Observable<boolean>;

  ngOnInit() {
    this.showSplash = this.splashService.getSplashVisible();
  }
}
