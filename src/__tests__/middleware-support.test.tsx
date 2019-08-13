import React from 'react'
import Adapter from 'enzyme-adapter-react-16'
import { ComponentRegistrar } from '../ComponentRegistrar'
import {
    testComponentWithPropsRegistration,
    testCompositionRegistration,
    TestComponentWithProps,
} from './testComponents'
import { configure, mount } from 'enzyme'
import { CompositionRegistrar } from '../CompositionRegistrar'
import { RouteBuilder } from '../RouteBuilder'

configure({ adapter: new Adapter() })

it('can hook component middleware', () => {
    let middlewareCalled: any
    let middlewareProps: any
    let middlewareNext: any
    const registrar = new ComponentRegistrar()
        .register(testComponentWithPropsRegistration)
        .registerMiddleware((_, mp: { skipRender?: boolean }, __, next) => {
            middlewareCalled = true
            middlewareProps = mp
            middlewareNext = next

            return null
        })

    const compositionRegistrar = CompositionRegistrar.create(registrar).registerComposition(
        testCompositionRegistration,
    )

    const routeBuilder = new RouteBuilder(compositionRegistrar)

    mount(
        <compositionRegistrar.ContentAreaRenderer
            componentRenderPath="test"
            contentArea={[
                { type: 'testWithTitleProp', props: { title: 'test' }, skipRender: true },
            ]}
            routeBuilder={routeBuilder}
            loadDataServices={{}}
        />,
    )

    expect(middlewareCalled).toBe(true)
    expect(middlewareProps).toMatchObject({ skipRender: true })

    // Verify next() will actually render the component
    const renderOutput = mount(middlewareNext())

    expect(renderOutput.find(TestComponentWithProps).length).toBe(1)
    expect(renderOutput.text()).toContain('test')
})

it('can hook multiple component middleware', () => {
    let middlewareCalled: any
    let middleware2Called: any
    let middleware2Props: any
    let middleware2Next: any
    const registrar = new ComponentRegistrar()
        .register(testComponentWithPropsRegistration)
        .registerMiddleware((props, _: { skipRender?: boolean }, services, next) => {
            middlewareCalled = true
            if (middleware2Called) {
                throw new Error('middlewares called out of order')
            }

            return next(props, _, services)
        })

        .registerMiddleware((_, middlewareProps: { skipRender2?: boolean }, __, next) => {
            middleware2Called = true
            middleware2Props = middlewareProps
            middleware2Next = next

            return null
        })

    const compositionRegistrar = CompositionRegistrar.create(registrar).registerComposition(
        testCompositionRegistration,
    )

    const routeBuilder = new RouteBuilder(compositionRegistrar)

    mount(
        <compositionRegistrar.ContentAreaRenderer
            componentRenderPath="test"
            contentArea={[
                { type: 'testWithTitleProp', props: { title: 'test' }, skipRender2: true },
            ]}
            routeBuilder={routeBuilder}
            loadDataServices={{}}
        />,
    )

    expect(middlewareCalled).toBe(true)
    expect(middleware2Called).toBe(true)
    expect(middleware2Props).toMatchObject({ skipRender2: true })

    // Verify next() will actually render the component
    const renderOutput = mount(middleware2Next())

    expect(renderOutput.find(TestComponentWithProps).length).toBe(1)
    expect(renderOutput.text()).toContain('test')
})
