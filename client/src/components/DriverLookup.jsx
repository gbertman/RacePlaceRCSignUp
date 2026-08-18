import { useEffect, useId, useState } from 'react';
import { Box, Paper, TextInput, UnstyledButton } from '@mantine/core';

function formatDriverName(driver) {
    const nickname = String(driver?.nickname || '').trim();
    return nickname
        ? `${driver.firstName} "${nickname}" ${driver.lastName}`
        : `${driver.firstName} ${driver.lastName}`;
}

function DriverLookup({ description, label = 'Name', onChange, onSelect, value = '' }) {
    const listId = useId();
    const [query, setQuery] = useState(value);
    const [matches, setMatches] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isActive, setIsActive] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);

    useEffect(() => {
        setQuery(value);
    }, [value]);

    useEffect(() => {
        const normalizedQuery = query.trim();
        if (!isActive || !normalizedQuery) {
            setMatches([]);
            setIsOpen(false);
            setActiveIndex(-1);
            return undefined;
        }

        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                const response = await fetch(`/drivers?name=${encodeURIComponent(normalizedQuery)}`, {
                    signal: controller.signal,
                });
                if (!response.ok) throw new Error(`Driver search failed with status ${response.status}`);
                const data = await response.json();
                const nextMatches = Array.isArray(data) ? data : [];
                setMatches(nextMatches);
                setIsOpen(nextMatches.length > 0);
                setActiveIndex(-1);
            } catch (error) {
                if (error.name !== 'AbortError') {
                    setMatches([]);
                    setIsOpen(false);
                }
            }
        }, 150);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [isActive, query]);

    const selectDriver = driver => {
        setQuery(`${driver.firstName} ${driver.lastName}`);
        setMatches([]);
        setIsOpen(false);
        setIsActive(false);
        setActiveIndex(-1);
        onSelect(driver);
    };

    const handleKeyDown = event => {
        if (!isOpen || matches.length === 0) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const delta = event.key === 'ArrowDown' ? 1 : -1;
            setActiveIndex(current => (current + delta + matches.length) % matches.length);
        } else if (event.key === 'Enter' && activeIndex >= 0) {
            event.preventDefault();
            selectDriver(matches[activeIndex]);
        } else if (event.key === 'Escape') {
            setIsOpen(false);
            setActiveIndex(-1);
        }
    };

    return (
        <Box
            className="driver-match-field"
            mb="md"
            onBlur={event => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                    setIsOpen(false);
                    setIsActive(false);
                    setActiveIndex(-1);
                }
            }}
        >
            <TextInput
                label={label}
                description={description}
                value={query}
                onChange={event => {
                    const nextValue = event.currentTarget.value;
                    setQuery(nextValue);
                    setIsActive(true);
                    onChange(nextValue);
                }}
                onFocus={() => setIsActive(true)}
                onKeyDown={handleKeyDown}
                placeholder="First, last, or nickname"
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={isOpen}
                aria-controls={listId}
                aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
            />
            {isOpen ? (
                <Paper id={listId} className="driver-match-list" withBorder shadow="md" role="listbox">
                    {matches.map((driver, index) => (
                        <UnstyledButton
                            id={`${listId}-${index}`}
                            key={`${driver.firstName}-${driver.lastName}-${index}`}
                            type="button"
                            className="driver-match-option"
                            data-active={activeIndex === index || undefined}
                            role="option"
                            aria-selected={activeIndex === index}
                            onMouseDown={event => event.preventDefault()}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => selectDriver(driver)}
                        >
                            {formatDriverName(driver)}
                        </UnstyledButton>
                    ))}
                </Paper>
            ) : null}
        </Box>
    );
}

export default DriverLookup;
