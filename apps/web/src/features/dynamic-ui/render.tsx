import { t } from '@app/lib/i18n';
import { ErrorBoundary, For, type JSX, Suspense } from 'solid-js';
import { match } from 'ts-pattern';
import { Col, Row, View } from './core/Layout';
import type { View as ComposedView, Widget, WidgetOf } from './schema';
import { Activity } from './widgets/Activity';
import { Calendar } from './widgets/Calendar';
import { ChannelMessage } from './widgets/ChannelMessage';
import { Kpi } from './widgets/Kpi';
import { List } from './widgets/List';
import { Md } from './widgets/Md';
import { Pins } from './widgets/Pins';
import { Timeline } from './widgets/Timeline';

/**
 * The single, exhaustive node renderer. One `match()` arm per widget `type`
 * dispatches to its real-props component, spreading the schema node directly.
 * The `container` arm recurses through {@link Container}. There is no registry
 * and no `<Dynamic>`: adding a widget means adding one arm here (and the
 * `.exhaustive()` keeps it honest).
 */
export function Render(props: { node: Widget }): JSX.Element {
  return match(props.node)
    .with({ type: 'md' }, (n) => <Md {...n} />)
    .with({ type: 'timeline' }, (n) => <Timeline {...n} />)
    .with({ type: 'channelMessage' }, (n) => <ChannelMessage {...n} />)
    .with({ type: 'list' }, (n) => <List {...n} />)
    .with({ type: 'calendar' }, (n) => <Calendar {...n} />)
    .with({ type: 'pins' }, (n) => <Pins {...n} />)
    .with({ type: 'kpi' }, (n) => <Kpi {...n} />)
    .with({ type: 'activity' }, (n) => <Activity {...n} />)
    .with({ type: 'container' }, (n) => <Container node={n} />)
    .exhaustive();
}

/**
 * Renders a `container` node: picks {@link RowLayout} or {@link Col} by
 * `direction` (defaulting to a column) and recurses each child through
 * {@link Render}. In a column every child is already full width.
 */
function Container(props: { node: WidgetOf<'container'> }): JSX.Element {
  const node = () => props.node;
  return match(node().direction)
    .with('row', () => <RowLayout node={node()} />)
    .otherwise(() => (
      <Col gap={node().gap} align={node().align} justify={node().justify}>
        <For each={node().children}>{(child) => <Render node={child} />}</For>
      </Col>
    ));
}

/**
 * Lays out a `row` container. Children share one flex row (lists included)
 * so two list tiles can sit side by side; `wrap` still lets them break when
 * the container is too narrow.
 */
function RowLayout(props: { node: WidgetOf<'container'> }): JSX.Element {
  return (
    <Row
      gap={props.node.gap}
      align={props.node.align}
      justify={props.node.justify}
      wrap={props.node.wrap}
    >
      <For each={props.node.children}>{(item) => <Render node={item} />}</For>
    </Row>
  );
}

/**
 * Renders a composed view: the layout {@link View} shell with each top-level
 * widget mapped through {@link Render}. The whole tree is wrapped in ONE
 * ErrorBoundary + Suspense (per the entity-lib idiom — the exhaustive match
 * makes per-widget boundaries unnecessary).
 */
export function Compose(props: { view: ComposedView }): JSX.Element {
  return (
    <ErrorBoundary
      fallback={(err) => (
        <div class="border-edge-muted text-ink-extra-muted rounded border border-dashed p-3 text-xs">
          Failed to render view: {String(err)}
        </div>
      )}
    >
      <Suspense
        fallback={
          <div class="text-ink-muted p-3 text-sm">{t('common.loading')}</div>
        }
      >
        <View title={props.view.title}>
          <For each={props.view.widgets}>
            {(widget) => <Render node={widget} />}
          </For>
        </View>
      </Suspense>
    </ErrorBoundary>
  );
}
