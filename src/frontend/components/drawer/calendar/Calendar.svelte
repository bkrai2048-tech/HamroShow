<script lang="ts">
    import { activeDays, activePopup, eventEdit, events, labelsDisabled, popupData, special } from "../../../stores"
    import { actionData } from "../../actions/actionData"
    import { removeDuplicates, sortByTime } from "../../helpers/array"
    import Icon from "../../helpers/Icon.svelte"
    import T from "../../helpers/T.svelte"
    import FloatingInputs from "../../input/FloatingInputs.svelte"
    import MaterialButton from "../../inputs/MaterialButton.svelte"
    import { adToBS, bsToAD, ENGLISH_MONTHS, getAvailableYears, getDaysInBSMonth, NEPALI_MONTHS, NEPALI_WEEKDAYS, toNepaliNumeral, type BSDate } from "../../../utils/nepaliCalendar"
    import { MILLISECONDS_IN_A_DAY, copyDate, getWeekNumber, isBetween, isSameDay } from "./calendar"

    export let active: string | null
    export let searchValue = ""

    $: sundayFirstDay = $special.firstDayOfWeek === "7"

    const today = new Date()
    const todayBS = adToBS(today)
    const availableYears = getAvailableYears()

    let year = todayBS.year
    let month = todayBS.month
    let calendarElem: HTMLElement | undefined
    let nextScrollTimeout: NodeJS.Timeout | null = null

    activeDays.set([copyDate(today).getTime()])

    type NepaliCalendarDay = BSDate & {
        adDate: Date
        inMonth: boolean
    }

    let days: NepaliCalendarDay[][] = []
    $: getDays(year, month, sundayFirstDay)

    function getDays(bsYear: number, bsMonth: number, _updater: any) {
        const daysInMonth = getDaysInBSMonth(bsYear, bsMonth)
        const firstDayAD = bsToAD({ year: bsYear, month: bsMonth, day: 1 })
        if (!daysInMonth || !firstDayAD) return

        const firstDayIndex = firstDayAD.getDay()
        const beforeCount = sundayFirstDay ? firstDayIndex : firstDayIndex === 0 ? 6 : firstDayIndex - 1
        const previousMonth = moveBSDate(bsYear, bsMonth, -1)
        const nextMonth = moveBSDate(bsYear, bsMonth, 1)
        const previousMonthDays = getDaysInBSMonth(previousMonth.year, previousMonth.month)

        let cells: NepaliCalendarDay[] = []
        for (let offset = beforeCount - 1; offset >= 0; offset--) cells.push(createDay(previousMonth.year, previousMonth.month, previousMonthDays - offset, false))
        for (let day = 1; day <= daysInMonth; day++) cells.push(createDay(bsYear, bsMonth, day, true))

        let nextDay = 1
        while (cells.length < 42) {
            cells.push(createDay(nextMonth.year, nextMonth.month, nextDay, false))
            nextDay++
        }

        days = []
        while (cells.length) days.push(cells.splice(0, 7))
    }

    function createDay(bsYear: number, bsMonth: number, day: number, inMonth: boolean): NepaliCalendarDay {
        return {
            year: bsYear,
            month: bsMonth,
            day,
            adDate: bsToAD({ year: bsYear, month: bsMonth, day }) || today,
            inMonth
        }
    }

    function moveBSDate(bsYear: number, bsMonth: number, amount: number) {
        let nextYear = bsYear
        let nextMonth = bsMonth + amount
        while (nextMonth < 1) {
            nextMonth += 12
            nextYear--
        }
        while (nextMonth > 12) {
            nextMonth -= 12
            nextYear++
        }
        return { year: nextYear, month: nextMonth }
    }

    let currentEvents: any[] = []
    $: updateEvents($events, { year, month, days, searchValue })

    function updateEvents(events: any, _updater: any) {
        if (!days[0]?.[0]) return

        currentEvents = []
        const first = copyDate(days[0][0].adDate).getTime()
        const last = copyDate(days[days.length - 1][6].adDate).getTime()
        const searchTerm = searchValue.trim().toLowerCase()

        Object.entries(events).forEach(([id, event]: any) => {
            const from = copyDate(new Date(event.from)).getTime()
            const to = copyDate(new Date(event.to || event.from)).getTime()
            const isVisible = (from >= first && from <= last) || (to >= first && to <= last) || (from <= first && to >= last)
            if (searchTerm && !`${event.name || ""} ${event.location || ""} ${event.notes || ""}`.toLowerCase().includes(searchTerm)) return
            if (isVisible) currentEvents.push({ id, ...event })
        })

        currentEvents = currentEvents.sort((a, b) => a.from - b.from)
    }

    let weekdays: { primary: string; secondary: string; index: number }[] = []
    $: {
        const order = sundayFirstDay ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0]
        weekdays = order.map((index) => ({ primary: NEPALI_WEEKDAYS.ne[index], secondary: NEPALI_WEEKDAYS.en[index], index }))
    }

    $: secondaryMonthDisplay = getSecondaryMonthDisplay(year, month)

    function getSecondaryMonthDisplay(bsYear: number, bsMonth: number) {
        const daysInMonth = getDaysInBSMonth(bsYear, bsMonth)
        const startAD = bsToAD({ year: bsYear, month: bsMonth, day: 1 })
        const endAD = bsToAD({ year: bsYear, month: bsMonth, day: daysInMonth })
        if (!startAD || !endAD) return ""

        const startMonth = ENGLISH_MONTHS.en[startAD.getMonth()]
        const endMonth = ENGLISH_MONTHS.en[endAD.getMonth()]
        if (startMonth === endMonth) return `${startMonth} ${startAD.getFullYear()}`
        return `${startMonth}/${endMonth} ${startAD.getFullYear()}`
    }

    function wheel(e: any) {
        if (nextScrollTimeout || !calendarElem) return

        const scrollDown = e.deltaY > 0
        if (scrollDown) nextMonth(true)
        else previousMonth(true)

        const isMouseAndNotTrackpad = e.deltaY >= 100 || e.deltaY <= -100
        if (isMouseAndNotTrackpad) return

        nextScrollTimeout = setTimeout(() => {
            nextScrollTimeout = null
        }, 500)
    }

    function nextMonth(checkScroll = false) {
        if (!calendarElem) return
        const scrolledToBottom = calendarElem.scrollTop + 1 + calendarElem.offsetHeight >= calendarElem.scrollHeight
        if (checkScroll && !scrolledToBottom) return

        const next = moveBSDate(year, month, 1)
        if (!getDaysInBSMonth(next.year, next.month)) return
        year = next.year
        month = next.month
    }

    function previousMonth(checkScroll = false) {
        const scrolledToTop = calendarElem?.scrollTop === 0
        if (checkScroll && !scrolledToTop) return

        const previous = moveBSDate(year, month, -1)
        if (!getDaysInBSMonth(previous.year, previous.month)) return
        year = previous.year
        month = previous.month
    }

    function previousYear() {
        if (!getDaysInBSMonth(year - 1, month)) return
        year--
    }

    function nextYear() {
        if (!getDaysInBSMonth(year + 1, month)) return
        year++
    }

    function getEvents(day: Date, currentEvents: any[], type: string) {
        let events: any[] = []
        currentEvents.forEach((a) => {
            const eventIsAtDayOrGoingThrough = a.to ? isBetween(new Date(a.from), new Date(a.to), copyDate(day)) : isSameDay(new Date(a.from), day)
            if (eventIsAtDayOrGoingThrough) events.push(a)
        })
        events.sort(sortByTime)
        events = events.filter((a) => a.type === type)

        return events
    }

    function dayClick(e: any, day: Date) {
        day = copyDate(day)

        if (e.ctrlKey || e.metaKey) return toggleCurrentDay(day)
        if (e.shiftKey) return selectRange(day)

        activeDays.set([day.getTime()])
    }

    function toggleCurrentDay(day: Date) {
        activeDays.update((a) => {
            const alreadySelected = a.includes(day.getTime())
            if (!alreadySelected) return [...a, day.getTime()]

            if (a.length < 2) return a
            a.splice(a.indexOf(day.getTime()), 1)

            return a
        })
    }

    function selectRange(day: Date) {
        let first = $activeDays[0] || day.getTime()
        let last = day.getTime()
        const timeDifference = day.getTime() - first
        if (timeDifference === 0) return

        if (timeDifference < 0) {
            first = last
            last = $activeDays[$activeDays.length - 1]
        }

        const newActiveDays: number[] = []
        let count = 0

        do {
            const newDay = copyDate(new Date(first + count * MILLISECONDS_IN_A_DAY)).getTime()
            newActiveDays.push(newDay)
            count++
        } while (!isSameDay(new Date(newActiveDays[newActiveDays.length - 1]), new Date(last)))

        activeDays.set(newActiveDays)
    }

    function move(e: any, day: Date) {
        if (!e.buttons) return
        activeDays.set(removeDuplicates([...$activeDays, copyDate(day).getTime()]))
    }

    $: if ($popupData?.action === "select_show" && $popupData?.location === "event" && $popupData?.showId) selectedShow()
    function selectedShow() {
        setTimeout(() => activePopup.set("edit_event"), 300)
    }

    function getEventIcon(type: string, { actionId }) {
        if (type === "event") return "calendar"
        if (type === "action") return actionData[actionId]?.icon || "actions"
        return type
    }

    $: isPresentDay = !!$activeDays.length && isSameDay(new Date($activeDays[0]), today) && year === todayBS.year && month === todayBS.month
    function setToPresentDay() {
        year = todayBS.year
        month = todayBS.month
        activeDays.set([copyDate(today).getTime()])
    }

    function isSaturday(index: number) {
        const weekday = weekdays[index]?.index
        return weekday === 6
    }
</script>

<div class="calendar">
    <div class="calendarHeader">
        <button type="button" class="todayButton" on:click={setToPresentDay}>आज</button>

        <div class="monthControls">
            <button type="button" on:click={previousYear} title="Previous year"><Icon id="previous" size={0.9} /><Icon id="previous" size={0.9} /></button>
            <button type="button" on:click={() => previousMonth()} title="Previous month"><Icon id="previous" size={1} /></button>

            <select bind:value={year} aria-label="BS year">
                {#each availableYears as availableYear}
                    <option value={availableYear}>{toNepaliNumeral(availableYear)}</option>
                {/each}
            </select>

            <select bind:value={month} aria-label="BS month">
                {#each NEPALI_MONTHS.ne as monthName, index}
                    <option value={index + 1}>{monthName}</option>
                {/each}
            </select>

            <button type="button" on:click={() => nextMonth()} title="Next month"><Icon id="next" size={1} /></button>
            <button type="button" on:click={nextYear} title="Next year"><Icon id="next" size={0.9} /><Icon id="next" size={0.9} /></button>
        </div>

        <div class="monthSummary">
            <strong>{toNepaliNumeral(year)} {NEPALI_MONTHS.ne[month - 1]}</strong>
            <span>{secondaryMonthDisplay}</span>
        </div>
    </div>

    <div class="week headerWeek">
        <div class="weekday sideLabel">बि.सं.</div>
        {#each weekdays as weekday}
            <div class="weekday" class:saturday={weekday.index === 6}>
                <span>{weekday.primary}</span>
                <small>{weekday.secondary}</small>
            </div>
        {/each}
    </div>

    <div class="grid" on:wheel|passive={wheel} bind:this={calendarElem}>
        {#each days as week}
            <div class="week">
                <span class="weeknumber">{toNepaliNumeral(getWeekNumber(week[0].adDate))}</span>

                {#each week as day, index}
                    {@const dayEvents = getEvents(day.adDate, currentEvents, active || "event")}
                    <div class="day" class:today={isSameDay(day.adDate, today)} class:faded={!day.inMonth} class:active={$activeDays?.includes(copyDate(day.adDate).getTime())} class:saturday={isSaturday(index)} on:mousedown={(e) => dayClick(e, day.adDate)} on:mousemove={(e) => move(e, day.adDate)}>
                        <span class="bsDay">{toNepaliNumeral(day.day)}</span>
                        <span class="adDay">{day.adDate.getDate()}</span>

                        <span class="events">
                            {#each dayEvents as event, i}
                                {@const eventIcon = getEventIcon(event.type, { actionId: event.action?.id })}

                                {#if dayEvents.length > 3 && i > 1}
                                    <span class="dot" style="background-color: {event.color || 'white'}" data-title={event.name} />
                                {:else}
                                    <div class="event" style="color: {event.color || 'white'}" data-title={event.name}>
                                        <Icon id={eventIcon} right white />
                                        <p>{event.name}</p>
                                    </div>
                                {/if}
                            {/each}
                        </span>
                    </div>
                {/each}
            </div>
        {/each}
    </div>
</div>

<FloatingInputs style="margin-left: 25px;" side="left">
    <MaterialButton title="media.previous" on:click={() => previousMonth()}>
        <Icon id="previous" size={1.1} />
    </MaterialButton>
    <MaterialButton title="media.next" on:click={() => nextMonth()}>
        <Icon id="next" size={1.1} />
    </MaterialButton>

    <div class="divider"></div>

    <MaterialButton title="calendar.today" isActive={isPresentDay} on:click={setToPresentDay}>
        <Icon id="home" white={!isPresentDay} size={1.1} />
    </MaterialButton>

    <div class="divider"></div>

    <span class="floatingMonth">
        {toNepaliNumeral(year)} {NEPALI_MONTHS.ne[month - 1]}
        <small>{secondaryMonthDisplay}</small>
    </span>
</FloatingInputs>

<FloatingInputs onlyOne>
    <MaterialButton
        on:click={() => {
            eventEdit.set(null)
            popupData.set({})
            activePopup.set("edit_event")
        }}
    >
        <Icon id="add" right={!$labelsDisabled} />
        {#if !$labelsDisabled}<T id="new.{active === 'action' ? 'event_action' : 'event'}" />{/if}
    </MaterialButton>
</FloatingInputs>

<style>
    .calendar {
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        overflow-y: auto;
        background: var(--primary);
    }

    .calendarHeader {
        display: grid;
        grid-template-columns: auto minmax(260px, 1fr) auto;
        gap: 12px;
        align-items: center;
        padding: 10px 12px;
        background: linear-gradient(90deg, var(--primary-darkest), var(--primary-darker));
        border-bottom: 1px solid var(--primary-lighter);
    }

    .todayButton,
    .monthControls button,
    .monthControls select {
        border: 1px solid color-mix(in srgb, var(--secondary) 35%, transparent);
        border-radius: 5px;
        background: color-mix(in srgb, var(--primary-lighter) 55%, transparent);
        color: var(--text);
        min-height: 30px;
    }

    .todayButton,
    .monthControls button {
        cursor: pointer;
        padding: 4px 9px;
        font-weight: 700;
    }

    .monthControls {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 6px;
        min-width: 0;
    }

    .monthControls select {
        padding: 4px 7px;
        color-scheme: dark;
    }

    .monthControls button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }

    .monthSummary {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        min-width: 120px;
    }

    .monthSummary strong {
        color: var(--secondary);
        white-space: nowrap;
    }

    .monthSummary span,
    .floatingMonth small,
    .weekday small,
    .adDay {
        opacity: 0.72;
        font-size: 0.78em;
    }

    .grid {
        flex: 10;
        display: flex;
        flex-direction: column;
        overflow: auto;
    }

    .week {
        display: flex;
        flex: 2;
        justify-content: space-between;
    }

    .headerWeek {
        flex: 0 0 auto;
    }

    .day,
    .weekday {
        padding: 5px;
        flex: 4;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .weekday {
        overflow: hidden;
        text-transform: capitalize;
        background-color: var(--primary-darkest);
        flex-direction: column;
        gap: 1px;
        font-weight: 700;
    }

    .weekday.saturday,
    .day.saturday .bsDay {
        color: #ff8f8f;
    }

    .sideLabel,
    .weeknumber {
        min-width: 25px;
        flex: 1;
        color: var(--secondary);
        background-color: var(--primary-darkest);
    }

    .weeknumber {
        font-size: 0.8em;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .day {
        position: relative;
        flex-direction: column;
        overflow: hidden;
        min-height: 72px;
        border-top: 1px solid color-mix(in srgb, var(--primary-lighter) 42%, transparent);
        border-left: 1px solid color-mix(in srgb, var(--primary-lighter) 28%, transparent);
    }

    .day:hover {
        background-color: var(--hover);
    }

    .day.faded {
        opacity: 0.48;
    }

    .day.today {
        color: var(--secondary);
        background-color: var(--primary-darkest);
    }

    .day.active {
        background-color: var(--focus);
    }

    .bsDay {
        font-size: 1.45em;
        font-weight: 800;
        line-height: 1;
    }

    .adDay {
        position: absolute;
        top: 5px;
        right: 7px;
    }

    .events {
        width: 100%;
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        min-height: 18px;
        margin-top: 4px;
    }

    .event {
        padding: 2px 5px;
        text-align: center;
        width: 100%;
        display: flex;
        align-items: center;
    }

    .event p {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .dot {
        display: flex;
        height: 10px;
        width: 10px;
        border-radius: 50%;
        margin: 2px;
    }

    .floatingMonth {
        opacity: 0.9;
        white-space: nowrap;
        align-self: center;
        padding: 0 10px;
        display: flex;
        flex-direction: column;
        line-height: 1.2;
    }

    @media (max-width: 760px) {
        .calendarHeader {
            grid-template-columns: 1fr;
        }

        .monthSummary {
            align-items: center;
        }
    }
</style>