package main

import (
	"encoding/json"
	"fmt"
)

func cmdPageviews(args []string) {
	apiURL, projectID, token, timeframe, _ := parseGlobalFlags(args)
	requireConfig(projectID, token)

	client := NewAPIClient(apiURL, projectID, token)

	var data interface{}
	path := fmt.Sprintf("/pageviews?timeframe=%s", timeframe)
	if err := client.get(path, &data); err != nil {
		if e, ok := err.(*SIError); ok {
			fail(e.Code, e)
		}
		fail(100, &SIError{Code: 100, Type: "api_error", Message: err.Error()})
	}

	if jsonOutput {
		printJSON(data)
	} else {
		b, _ := json.MarshalIndent(data, "", "  ")
		fmt.Println(string(b))
	}
}

func cmdErrors(args []string) {
	apiURL, projectID, token, timeframe, _ := parseGlobalFlags(args)
	requireConfig(projectID, token)

	client := NewAPIClient(apiURL, projectID, token)

	var data interface{}
	path := fmt.Sprintf("/errors?timeframe=%s", timeframe)
	if err := client.get(path, &data); err != nil {
		if e, ok := err.(*SIError); ok {
			fail(e.Code, e)
		}
		fail(100, &SIError{Code: 100, Type: "api_error", Message: err.Error()})
	}

	if jsonOutput {
		printJSON(data)
	} else {
		b, _ := json.MarshalIndent(data, "", "  ")
		fmt.Println(string(b))
	}
}

func cmdAutocapture(args []string) {
	apiURL, projectID, token, timeframe, remaining := parseGlobalFlags(args)
	requireConfig(projectID, token)

	client := NewAPIClient(apiURL, projectID, token)

	showTop := false
	for _, a := range remaining {
		if a == "--top" {
			showTop = true
		}
	}

	if showTop {
		var data interface{}
		path := fmt.Sprintf("/events/$click?timeframe=%s", timeframe)
		if err := client.get(path, &data); err != nil {
			if e, ok := err.(*SIError); ok {
				fail(e.Code, e)
			}
			fail(100, &SIError{Code: 100, Type: "api_error", Message: err.Error()})
		}

		if jsonOutput {
			printJSON(map[string]interface{}{
				"event":   "$click",
				"details": data,
				"note":    "Run without --top for raw $click events",
			})
		} else {
			fmt.Printf("Autocapture ($click) events (timeframe: %s)\n", timeframe)
			fmt.Println("Use `si events list --event $click --json` for raw data")
			b, _ := json.MarshalIndent(data, "", "  ")
			fmt.Println(string(b))
		}
		return
	}

	if jsonOutput {
		printJSON(map[string]string{
			"message":    "Use --top to see top clicked elements",
			"event_type": "$click",
			"command":    "si autocapture --top",
		})
	} else {
		fmt.Println("Autocapture events ($click)")
		fmt.Println()
		fmt.Println("  si events list --event $click          List raw $click events")
		fmt.Println("  si autocapture --top                    Top clicked elements")
		fmt.Println("  si events get $click --timeframe 7d     $click events over 7 days")
		fmt.Println()
		fmt.Println("Configure autocapture in your SDK init:")
		fmt.Println("  SuperInsights.init('pk_...', { autocapture: { enabled: true, selectors: ['button', 'a.btn'] } })")
	}
}
