<script lang="ts">
    import { activeDays, activePopup, eventEdit, events, labelsDisabled, popupData, special } from "../../../stores"
    import { adToBS, bsToAD, ENGLISH_MONTHS, getAvailableYears, getDaysInBSMonth, NEPALI_MONTHS, NEPALI_WEEKDAYS, toNepaliNumeral, type BSDate } from "../../../utils/nepaliCalendar"
    import { actionData } from "../../actions/actionData"
    import { removeDuplicates, sortByTime } from "../../helpers/array"
    import Icon from "../../helpers/Icon.svelte"
    import T from "../../helpers/T.svelte"
    import FloatingInputs from "../../input/FloatingInputs.svelte"
    import MaterialButton from "../../inputs/MaterialButton.svelte"
    import { MILLISECONDS_IN_A_DAY, copyDate, getWeekNumber, isBetween, isSameDay } from "./calendar"

    export let active: string | null
    export let searchValue = ""

    type CalendarMode = "bs" | "ad"
    type CalendarDay = {
        bs: BSDate
        adDate: Date
        adYear: number
        adMonth: number
        adDay: number
        inMonth: boolean
    }

    const today = new Date()
    const todayBS = adToBS(today)
    const bsYears = getAvailableYears()
    const firstADYear = bsToAD({ year: bsYears[0], month: 1, day: 1 })?.getFullYear() || today.getFullYear() - 80
    const lastBSYear = bsYears[bsYears.length - 1]
    const lastADYear = bsToAD({ year: lastBSYear, month: 12, day: getDaysInBSMonth(lastBSYear, 12) })?.getFullYear() || today.getFullYear() + 20
    const adYears = Array.from({ length: lastADYear - firstADYear + 1 }, (_, index) => firstADYear + index)
    const weekdays = [0, 1, 2, 3, 4, 5, 6].map((index) => ({ primary: NEPALI_WEEKDAYS.ne[index], secondary: NEPALI_WEEKDAYS.en[index], index }))

    let bsYear = todayBS.year
    let bsMonth = todayBS.month
    let adYear = today.getFullYear()
    let adMonth = today.getMonth() + 1
    let calendarElem: HTMLElement | undefined
    let nextScrollTimeout: NodeJS.Timeout | null = null

    activeDays.set([copyDate(today).getTime()])

    $: calendarMode = ($special.calendarMode === "ad" ? "ad" : "bs") as CalendarMode
    $: yearOptions = calendarMode === "bs" ? bsYears : adYears
    $: primaryMonthDisplay = getPrimaryMonthDisplay(calendarMode)
    $: secondaryMonthDisplay = getSecondaryMonthDisplay(calendarMode)

    let days: CalendarDay[][] = []
    $: getDays(calendarMode, bsYear, bsMonth, adYear, adMonth)

    function getDays(mode: CalendarMode, _bsYear: number, _bsMonth: number, _adYear: number, _adMonth: number) {
        days = mode === "bs" ? getBSDays(_bsYear, _bsMonth) : getADDays(_adYear, _adMonth)
    }

    function getBSDays(year: number, month: number) {
        const daysInMonth = getDaysInBSMonth(year, month)
        const firstDayAD = bsToAD({ year, month, day: 1 })
        if (!daysInMonth || !firstDayAD) return days

        const beforeCount = firstDayAD.getDay()
        const previousMonth = moveBSDate(year, month, -1)
        const nextMonth = moveBSDate(year, month, 1)
        const previousMonthDays = getDaysInBSMonth(previousMonth.year, previousMonth.month)

        const cells: CalendarDay[] = []
        for (let offset = beforeCount - 1; offset >= 0; offset--) cells.push(createBSDay(previousMonth.year, previousMonth.month, previousMonthDays - offset, false))
        for (let day = 1; day <= daysInMonth; day++) cells.push(createBSDay(year, month, day, true))

        let nextDay = 1
        while (cells.length < 42) {
            cells.push(createBSDay(nextMonth.year, nextMonth.month, nextDay, false))
            nextDay++
        }

        return chunkWeeks(cells)
    }

    function getADDays(year: number, month: number) {
        const daysInMonth = new Date(year, month, 0).getDate()
        const firstDayAD = new Date(year, month - 1, 1)
        const beforeCount = firstDayAD.getDay()

        const cells: CalendarDay[] = []
        for (let offset = beforeCount - 1; offset >= 0; offset--) cells.push(createADDay(new Date(year, month - 1, -offset), false))
        for (let day = 1; day <= daysInMonth; day++) cells.push(createADDay(new Date(year, month - 1, day), true))

        let nextOffset = 1
        while (cells.length < 42) {
            cells.push(createADDay(new Date(year, month - 1, daysInMonth + nextOffset), false))
            nextOffset++
        }

        return chunkWeeks(cells)
    }

    function chunkWeeks(cells: CalendarDay[]) {
        const weeks: CalendarDay[][] = []
        while (cells.length) weeks.push(cells.splice(0, 7))
        return weeks
    }

    function createBSDay(year: number, month: number, day: number, inMonth: boolean): CalendarDay {
        const adDate = bsToAD({ year, month, day }) || today
        return createCalendarDay(adDate, { year, month, day }, inMonth)
    }

    function createADDay(adDate: Date, inMonth: boolean): CalendarDay {
        return createCalendarDay(adDate, adToBS(adDate), inMonth)
    }

    function createCalendarDay(adDate: Date, bs: BSDate, inMonth: boolean): CalendarDay {
        return {
            bs,
            adDate,
            adYear: adDate.getFullYear(),
            adMonth: adDate.getMonth() + 1,
            adDay: adDate.getDate(),
            inMonth
        }
    }

    function moveBSDate(year: number, month: number, amount: number) {
        let nextYear = year
        let nextMonth = month + amount
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
    $: updateEvents($events, { days, searchValue })

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

    function setCalendarMode(mode: CalendarMode) {
        if (mode === calendarMode) return

        if (mode === "ad") {
            const anchor = bsToAD({ year: bsYear, month: bsMonth, day: 1 }) || today
            adYear = anchor.getFullYear()
            adMonth = anchor.getMonth() + 1
        } else {
            const bsDate = adToBS(new Date(adYear, adMonth - 1, 1))
            bsYear = bsDate.year
            bsMonth = bsDate.month
        }

        special.update((data) => ({ ...data, calendarMode: mode }))
    }

    function getPrimaryMonthDisplay(mode: CalendarMode) {
        if (mode === "ad") return `${toNepaliNumeral(adYear)} ${ENGLISH_MONTHS.ne[adMonth - 1]}`
        return `${toNepaliNumeral(bsYear)} ${NEPALI_MONTHS.ne[bsMonth - 1]}`
    }

    function getSecondaryMonthDisplay(mode: CalendarMode) {
        if (mode === "ad") {
            const startBS = adToBS(new Date(adYear, adMonth - 1, 1))
            const endBS = adToBS(new Date(adYear, adMonth, 0))
            if (startBS.year === endBS.year && startBS.month === endBS.month) return `${toNepaliNumeral(startBS.year)} ${NEPALI_MONTHS.ne[startBS.month - 1]}`
            return `${toNepaliNumeral(startBS.year)} ${NEPALI_MONTHS.ne[startBS.month - 1]} / ${toNepaliNumeral(endBS.year)} ${NEPALI_MONTHS.ne[endBS.month - 1]}`
        }

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

        if (calendarMode === "ad") {
            const next = new Date(adYear, adMonth, 1)
            adYear = next.getFullYear()
            adMonth = next.getMonth() + 1
            return
        }

        const next = moveBSDate(bsYear, bsMonth, 1)
        if (!getDaysInBSMonth(next.year, next.month)) return
        bsYear = next.year
        bsMonth = next.month
    }

    function previousMonth(checkScroll = false) {
        const scrolledToTop = calendarElem?.scrollTop === 0
        if (checkScroll && !scrolledToTop) return

        if (calendarMode === "ad") {
            const previous = new Date(adYear, adMonth - 2, 1)
            adYear = previous.getFullYear()
            adMonth = previous.getMonth() + 1
            return
        }

        const previous = moveBSDate(bsYear, bsMonth, -1)
        if (!getDaysInBSMonth(previous.year, previous.month)) return
        bsYear = previous.year
        bsMonth = previous.month
    }

    function previousYear() {
        if (calendarMode === "ad") {
            adYear--
            return
        }

        if (!getDaysInBSMonth(bsYear - 1, bsMonth)) return
        bsYear--
    }

    function nextYear() {
        if (calendarMode === "ad") {
            adYear++
            return
        }

        if (!getDaysInBSMonth(bsYear + 1, bsMonth)) return
        bsYear++
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

    $: isPresentDay = !!$activeDays.length && isSameDay(new Date($activeDays[0]), today) && ((calendarMode === "bs" && bsYear === todayBS.year && bsMonth === todayBS.month) || (calendarMode === "ad" && adYear === today.getFullYear() && adMonth === today.getMonth() + 1))
    function setToPresentDay() {
        bsYear = todayBS.year
        bsMonth = todayBS.month
        adYear = today.getFullYear()
        adMonth = today.getMonth() + 1
        activeDays.set([copyDate(today).getTime()])
    }

    function isSaturday(index: number) {
        const weekday = weekdays[index]?.index
        return weekday === 6
    }

    function getWeekLabel(week: CalendarDay[]) {
        if (calendarMode === "ad") return getWeekNumber(week[0].adDate)
        return getBSWeekNumber(week[0])
    }

    function getBSWeekNumber(day: CalendarDay) {
        const yearStart = bsToAD({ year: day.bs.year, month: 1, day: 1 })
        if (!yearStart) return getWeekNumber(day.adDate)

        const daysSinceNewYear = Math.floor((copyDate(day.adDate).getTime() - copyDate(yearStart).getTime()) / MILLISECONDS_IN_A_DAY)
        return Math.max(1, Math.floor((daysSinceNewYear + yearStart.getDay()) / 7) + 1)
    }

    function getPrimaryDay(day: CalendarDay) {
        return toNepaliNumeral(calendarMode === "ad" ? day.adDay : day.bs.day)
    }

    function getSecondaryDay(day: CalendarDay) {
        if (calendarMode === "ad") return `${toNepaliNumeral(day.bs.day)} ${NEPALI_MONTHS.ne[day.bs.month - 1]}`
        return toNepaliNumeral(day.adDay)
    }
</script>

<div class="calendar">
    <div class="calendarHeader">
        <button type="button" class="todayButton" on:click={setToPresentDay}>आज</button>

        <div class="modeToggle" aria-label="Calendar mode">
            <button type="button" class:active={calendarMode === "bs"} on:click={() => setCalendarMode("bs")}>बि.सं.</button>
            <button type="button" class:active={calendarMode === "ad"} on:click={() => setCalendarMode("ad")}>ई.सं.</button>
        </div>

        <div class="monthControls">
            <button type="button" on:click={previousYear} title="Previous year"><Icon id="previous" size={0.9} /><Icon id="previous" size={0.9} /></button>
            <button type="button" on:click={() => previousMonth()} title="Previous month"><Icon id="previous" size={1} /></button>

            {#if calendarMode === "bs"}
                <select bind:value={bsYear} aria-label="BS year">
                    {#each yearOptions as availableYear}
                        <option value={availableYear}>{toNepaliNumeral(availableYear)}</option>
                    {/each}
                </select>

                <select bind:value={bsMonth} aria-label="BS month">
                    {#each NEPALI_MONTHS.ne as monthName, index}
                        <option value={index + 1}>{monthName}</option>
                    {/each}
                </select>
            {:else}
                <select bind:value={adYear} aria-label="AD year">
                    {#each yearOptions as availableYear}
                        <option value={availableYear}>{toNepaliNumeral(availableYear)}</option>
                    {/each}
                </select>

                <select bind:value={adMonth} aria-label="AD month">
                    {#each ENGLISH_MONTHS.ne as monthName, index}
                        <option value={index + 1}>{monthName}</option>
                    {/each}
                </select>
            {/if}

            <button type="button" on:click={() => nextMonth()} title="Next month"><Icon id="next" size={1} /></button>
            <button type="button" on:click={nextYear} title="Next year"><Icon id="next" size={0.9} /><Icon id="next" size={0.9} /></button>
        </div>

        <div class="monthSummary">
            <strong>{primaryMonthDisplay}</strong>
            <span>{secondaryMonthDisplay}</span>
        </div>
    </div>

    <div class="week headerWeek">
        <div class="weekday sideLabel">हप्ता</div>
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
                <span class="weeknumber">{toNepaliNumeral(getWeekLabel(week))}</span>

                {#each week as day, index}
                    {@const dayEvents = getEvents(day.adDate, currentEvents, active || "event")}
                    <div class="day" class:today={isSameDay(day.adDate, today)} class:faded={!day.inMonth} class:active={$activeDays?.includes(copyDate(day.adDate).getTime())} class:saturday={isSaturday(index)} on:mousedown={(e) => dayClick(e, day.adDate)} on:mousemove={(e) => move(e, day.adDate)}>
                        <span class="bsDay">{getPrimaryDay(day)}</span>
                        <span class="adDay">{getSecondaryDay(day)}</span>

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
        {primaryMonthDisplay}
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
        grid-template-columns: auto auto minmax(260px, 1fr) auto;
        gap: 12px;
        align-items: center;
        padding: 10px 12px;
        background: linear-gradient(90deg, var(--primary-darkest), var(--primary-darker));
        border-bottom: 1px solid var(--primary-lighter);
    }

    .todayButton,
    .modeToggle button,
    .monthControls button,
    .monthControls select {
        border: 1px solid color-mix(in srgb, var(--secondary) 35%, transparent);
        border-radius: 5px;
        background: color-mix(in srgb, var(--primary-lighter) 55%, transparent);
        color: var(--text);
        min-height: 30px;
    }

    .todayButton,
    .modeToggle button,
    .monthControls button {
        cursor: pointer;
        padding: 4px 9px;
        font-weight: 700;
    }

    .modeToggle {
        display: inline-flex;
        overflow: hidden;
        border: 1px solid color-mix(in srgb, var(--secondary) 35%, transparent);
        border-radius: 5px;
    }

    .modeToggle button {
        border: 0;
        border-radius: 0;
        min-width: 54px;
    }

    .modeToggle button.active {
        background: var(--secondary);
        color: var(--primary-darkest);
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
