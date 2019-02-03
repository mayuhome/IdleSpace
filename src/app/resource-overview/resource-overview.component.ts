import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  Input,
  ChangeDetectorRef,
  OnDestroy,
  AfterViewInit
} from "@angular/core";
import { Resource } from "../model/resource/resource";
import { Subscription } from "rxjs";
import { MainService } from "../main.service";
import { Options } from "ng5-slider";
import { AbstractAction } from "../model/actions/abstractAction";

@Component({
  selector: "app-resource-overview",
  templateUrl: "./resource-overview.component.html",
  styleUrls: ["./resource-overview.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResourceOverviewComponent
  implements OnInit, OnDestroy, AfterViewInit {
  @Input() res: Resource;
  showSlider = false;
  sliderOptions: Options = {
    floor: 0,
    ceil: 100
  };
  private subscriptions: Subscription[] = [];

  constructor(public ms: MainService, private cd: ChangeDetectorRef) {}
  ngOnInit() {
    this.subscriptions.push(
      this.ms.em.updateEmitter.subscribe(() => {
        this.cd.markForCheck();
      })
    );
  }
  ngAfterViewInit(): void {
    this.showSlider = true;
  }
  ngOnDestroy() {
    this.subscriptions.forEach((sub: Subscription) => sub.unsubscribe());
  }

  getResId(index, base: Resource) {
    return base.id;
  }
  getActId(index, base: AbstractAction) {
    return base.id;
  }
}